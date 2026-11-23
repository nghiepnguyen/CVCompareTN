-- Prints the upstream keep-alive settings the RUNNING Kong workers use (admin
-- API, not the .kong_env file). Run inside the Kong container with `resty`
-- (the image has no curl). Output: "pool=<n> idle=<s> maxreq=<n>".
local sock = ngx.socket.tcp()
sock:settimeout(3000)
assert(sock:connect("127.0.0.1", 8001))
assert(sock:send("GET / HTTP/1.0\r\nHost: localhost\r\n\r\n"))
local raw = assert(sock:receive("*a"))
local c = require("cjson").decode(raw:match("\r\n\r\n(.*)$")).configuration
print(string.format("pool=%d idle=%d maxreq=%d", c.upstream_keepalive_pool_size,
  c.upstream_keepalive_idle_timeout, c.upstream_keepalive_max_requests))
