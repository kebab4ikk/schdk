package app.schdk.host;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * A small HTTP server that runs inside the app and lets a smartboard on the same network show the
 * players' screen. Plain Java (no Android classes) so it can be tested on a desktop JVM.
 *
 * <p>Routes (the web side is src/remote/protocol.ts):
 * <ul>
 *   <li>GET / and /display: the web app (index.html)</li>
 *   <li>GET /api/info: token, links and screen count; only for the tablet itself (loopback)</li>
 *   <li>POST /api/model (X-Token): the latest players' view, relayed to every screen</li>
 *   <li>PUT /api/media (X-Token), GET /api/media: the current question's picture/audio/video</li>
 *   <li>GET /api/events: server-sent events carrying the players' view</li>
 * </ul>
 * The question pack never goes through here, only what players may see at that moment.
 */
public final class ScreenServer {
    /** Where index.html comes from: the APK's assets, or a file in desktop tests. */
    public interface Assets {
        byte[] indexHtml() throws IOException;
    }

    private static final int MAX_HEADER = 32 * 1024;
    private static final int MAX_MODEL = 4 * 1024 * 1024;
    private static final int MAX_MEDIA = 300 * 1024 * 1024;

    private final Assets assets;
    private final String token;
    private final List<OutputStream> screens = new CopyOnWriteArrayList<>();
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "screen-server");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService pinger = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "screen-server-ping");
        t.setDaemon(true);
        return t;
    });

    private volatile ServerSocket socket;
    private volatile String model; // latest RemotePayload JSON
    private volatile byte[] media;
    private volatile String mediaType = "application/octet-stream";
    private byte[] indexCache;

    public ScreenServer(Assets assets) {
        this.assets = assets;
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        this.token = sb.toString();
    }

    /** Starts on the first free port from {@code firstPort}; returns the port. */
    public synchronized int start(int firstPort, int attempts) throws IOException {
        IOException last = null;
        for (int p = firstPort; p < firstPort + attempts; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                socket = s;
                pool.execute(this::acceptLoop);
                // Comments keep idle connections alive through Wi-Fi power saving and proxies.
                pinger.scheduleAtFixedRate(() -> broadcast(": ping\n\n"), 15, 15, TimeUnit.SECONDS);
                return p;
            } catch (IOException e) {
                last = e;
            }
        }
        throw last != null ? last : new IOException("no port");
    }

    public void stop() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
        }
        for (OutputStream o : screens) closeQuietly(o);
        screens.clear();
        pinger.shutdownNow();
        pool.shutdownNow();
    }

    public int port() {
        return socket == null ? -1 : socket.getLocalPort();
    }

    public int screenCount() {
        return screens.size();
    }

    /** Links a smartboard can open: one per IPv4 address of an active, non-loopback interface. */
    public List<String> displayUrls() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        out.add("http://" + a.getHostAddress() + ":" + port() + "/display");
                    }
                }
            }
        } catch (SocketException ignored) {
        }
        // Wi-Fi and hotspot addresses (192.168.x / 10.x) first: those are what the board can reach.
        out.sort((x, y) -> Integer.compare(rank(x), rank(y)));
        return out;
    }

    private static int rank(String url) {
        if (url.contains("//192.168.")) return 0;
        if (url.contains("//10.")) return 1;
        if (url.contains("//172.")) return 2;
        return 3;
    }

    // ---------------------------------------------------------------- connection handling

    private void acceptLoop() {
        while (!socket.isClosed()) {
            try {
                Socket c = socket.accept();
                pool.execute(() -> handle(c));
            } catch (IOException e) {
                if (socket.isClosed()) return;
            }
        }
    }

    private static final class Request {
        String method;
        String path;
        String query = "";
        final Map<String, String> headers = new HashMap<>();
        InputStream body;
        boolean loopback;

        String header(String name) {
            return headers.get(name.toLowerCase(Locale.ROOT));
        }
    }

    private void handle(Socket c) {
        boolean keepOpen = false;
        try {
            c.setSoTimeout(30_000);
            InputStream in = new BufferedInputStream(c.getInputStream());
            OutputStream out = c.getOutputStream();
            Request r = readHead(in);
            if (r == null) return;
            r.loopback = c.getInetAddress().isLoopbackAddress();
            r.body = in;
            if (r.method.equals("GET") && r.path.equals("/api/events")) {
                c.setSoTimeout(0);
                keepOpen = true;
                openEvents(out);
                return;
            }
            route(r, out);
            out.flush();
        } catch (IOException ignored) {
        } finally {
            if (!keepOpen) {
                try {
                    c.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private static Request readHead(InputStream in) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        // Read until the blank line that ends the headers ("\r\n\r\n", or "\n\n" from lax clients).
        int b0 = -1, b1 = -1;
        while (true) {
            int b = in.read();
            if (b < 0) return null;
            head.write(b);
            if (head.size() > MAX_HEADER) throw new IOException("header too large");
            if (b == '\n' && (b0 == '\n' || (b0 == '\r' && b1 == '\n'))) break;
            b1 = b0;
            b0 = b;
        }
        String[] lines = head.toString("ISO-8859-1").split("\r?\n");
        String[] first = lines[0].split(" ");
        if (first.length < 2) return null;
        Request r = new Request();
        r.method = first[0].toUpperCase(Locale.ROOT);
        String target = first[1];
        int q = target.indexOf('?');
        r.path = q >= 0 ? target.substring(0, q) : target;
        if (q >= 0) r.query = target.substring(q + 1);
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon > 0) r.headers.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT), lines[i].substring(colon + 1).trim());
        }
        return r;
    }

    private void route(Request r, OutputStream out) throws IOException {
        String path = r.path.length() > 1 && r.path.endsWith("/") ? r.path.substring(0, r.path.length() - 1) : r.path;
        switch (r.method + " " + path) {
            case "GET /":
            case "GET /index.html":
            case "GET /display":
                send(out, 200, "text/html; charset=utf-8", index(), r.method);
                return;
            case "GET /api/info":
                if (!r.loopback) {
                    sendText(out, 403, "forbidden");
                    return;
                }
                send(out, 200, "application/json; charset=utf-8", infoJson().getBytes(StandardCharsets.UTF_8), r.method);
                return;
            case "POST /api/model": {
                if (!authorised(r, out)) return;
                byte[] body = readBody(r, MAX_MODEL);
                if (body == null) {
                    sendText(out, 413, "too large");
                    return;
                }
                String json = new String(body, StandardCharsets.UTF_8);
                model = json;
                broadcast(event(json));
                send(out, 200, "application/json; charset=utf-8", ("{\"displays\":" + screens.size() + "}").getBytes(StandardCharsets.UTF_8), r.method);
                return;
            }
            case "PUT /api/media": {
                if (!authorised(r, out)) return;
                byte[] body = readBody(r, MAX_MEDIA);
                if (body == null) {
                    sendText(out, 413, "too large");
                    return;
                }
                String type = r.header("content-type");
                mediaType = type == null || type.isEmpty() ? "application/octet-stream" : type;
                media = body;
                sendText(out, 200, "ok");
                return;
            }
            case "GET /api/media":
            case "HEAD /api/media":
                sendMedia(r, out);
                return;
            case "GET /favicon.ico":
                sendText(out, 404, "");
                return;
            default:
                sendText(out, 404, "not found");
        }
    }

    private boolean authorised(Request r, OutputStream out) throws IOException {
        if (token.equals(r.header("x-token"))) return true;
        sendText(out, 403, "forbidden");
        return false;
    }

    private static byte[] readBody(Request r, int max) throws IOException {
        String len = r.header("content-length");
        if (len == null) return new byte[0];
        long n;
        try {
            n = Long.parseLong(len);
        } catch (NumberFormatException e) {
            throw new IOException("bad length");
        }
        if (n < 0 || n > max) return null;
        byte[] buf = new byte[(int) n];
        int off = 0;
        while (off < n) {
            int k = r.body.read(buf, off, (int) n - off);
            if (k < 0) throw new IOException("short body");
            off += k;
        }
        return buf;
    }

    private String infoJson() {
        StringBuilder sb = new StringBuilder("{\"token\":\"").append(token).append("\",\"port\":").append(port()).append(",\"displays\":")
                .append(screens.size()).append(",\"urls\":[");
        List<String> urls = displayUrls();
        for (int i = 0; i < urls.size(); i++) sb.append(i > 0 ? "," : "").append('"').append(urls.get(i)).append('"');
        return sb.append("]}").toString();
    }

    private synchronized byte[] index() throws IOException {
        if (indexCache == null) indexCache = assets.indexHtml();
        return indexCache;
    }

    // ---------------------------------------------------------------- server-sent events

    private void openEvents(OutputStream out) throws IOException {
        String head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-cache\r\n"
                + "Connection: keep-alive\r\nX-Accel-Buffering: no\r\n\r\nretry: 1500\n\n";
        synchronized (out) {
            out.write(head.getBytes(StandardCharsets.UTF_8));
            String m = model;
            if (m != null) out.write(event(m).getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        screens.add(out);
    }

    private static String event(String json) {
        // Each line of the payload becomes its own "data:" line, as the SSE format requires.
        StringBuilder sb = new StringBuilder();
        for (String line : json.split("\r?\n", -1)) sb.append("data: ").append(line).append('\n');
        return sb.append('\n').toString();
    }

    private void broadcast(String text) {
        byte[] b = text.getBytes(StandardCharsets.UTF_8);
        for (OutputStream o : screens) {
            try {
                synchronized (o) {
                    o.write(b);
                    o.flush();
                }
            } catch (IOException e) {
                screens.remove(o);
                closeQuietly(o);
            }
        }
    }

    // ---------------------------------------------------------------- responses

    private void sendMedia(Request r, OutputStream out) throws IOException {
        byte[] m = media;
        if (m == null) {
            sendText(out, 404, "no media");
            return;
        }
        // Range support: browsers stream and seek audio/video with partial requests.
        String range = r.header("range");
        int start = 0;
        int end = m.length - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=") && m.length > 0) {
            String spec = range.substring(6).split(",")[0].trim();
            int dash = spec.indexOf('-');
            try {
                if (dash == 0) {
                    start = Math.max(0, m.length - Integer.parseInt(spec.substring(1)));
                } else {
                    start = Integer.parseInt(spec.substring(0, dash));
                    if (dash < spec.length() - 1) end = Math.min(end, Integer.parseInt(spec.substring(dash + 1)));
                }
                partial = true;
            } catch (NumberFormatException ignored) {
            }
            if (partial && start > end) {
                String h = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + m.length + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                out.write(h.getBytes(StandardCharsets.ISO_8859_1));
                return;
            }
        }
        int len = end - start + 1;
        StringBuilder h = new StringBuilder();
        h.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
        h.append("Content-Type: ").append(mediaType).append("\r\n");
        h.append("Accept-Ranges: bytes\r\n");
        if (partial) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(m.length).append("\r\n");
        h.append("Content-Length: ").append(len).append("\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (!"HEAD".equals(r.method)) out.write(m, start, len);
    }

    private static void send(OutputStream out, int status, String type, byte[] body, String method) throws IOException {
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        if (!"HEAD".equals(method)) out.write(body);
    }

    private static void sendText(OutputStream out, int status, String text) throws IOException {
        send(out, status, "text/plain; charset=utf-8", text.getBytes(StandardCharsets.UTF_8), "GET");
    }

    private static String reason(int s) {
        switch (s) {
            case 200: return "OK";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 413: return "Payload Too Large";
            default: return "Status";
        }
    }

    private static void closeQuietly(OutputStream o) {
        try {
            o.close();
        } catch (IOException ignored) {
        }
    }

    /** Desktop runner for tests: {@code java ScreenServer.java path/to/index.html [port]}. */
    public static void main(String[] args) throws Exception {
        java.nio.file.Path index = java.nio.file.Paths.get(args.length > 0 ? args[0] : "dist/index.html");
        ScreenServer s = new ScreenServer(() -> java.nio.file.Files.readAllBytes(index));
        int port = s.start(args.length > 1 ? Integer.parseInt(args[1]) : 8765, 10);
        System.out.println("listening on " + port);
        for (String u : s.displayUrls()) System.out.println("  " + u);
        Thread.currentThread().join();
    }
}
