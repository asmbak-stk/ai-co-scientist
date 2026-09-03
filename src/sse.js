// Minimal Server-Sent Events helper.

export function createSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  // Heartbeat so proxies/browsers keep the connection open during long agent calls.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* socket gone */
    }
  }, 15000);

  let closed = false;

  function emit(event, data) {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data ?? {})}\n\n`);
    } catch {
      /* socket gone */
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {
      /* already ended */
    }
  }

  return { emit, close, get closed() { return closed; } };
}
