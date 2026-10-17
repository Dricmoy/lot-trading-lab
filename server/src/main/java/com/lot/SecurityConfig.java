package com.lot;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
  @Bean
  org.springframework.security.core.userdetails.UserDetailsService noGeneratedUsers() {
    return username -> {
      throw new org.springframework.security.core.userdetails.UsernameNotFoundException(
          "Use the Lot identity API.");
    };
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    var repo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    repo.setCookieName("csrftoken");
    repo.setHeaderName("X-CSRFToken");
    repo.setCookieCustomizer(c -> c.sameSite("Lax").path("/").secure(Identity.PRODUCTION));
    return http.authorizeHttpRequests(a -> a.anyRequest().permitAll())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(
            c ->
                c.csrfTokenRepository(repo)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                    .ignoringRequestMatchers("/api/engine"))
        .exceptionHandling(
            e ->
                e.accessDeniedHandler(
                    (request, response, exception) -> {
                      response.setStatus(403);
                      response.setContentType("application/json");
                      response
                          .getWriter()
                          .write(
                              "{\"error\":\"Reload the page before trying that action again.\"}");
                    }))
        .headers(h -> h.frameOptions(f -> f.deny()))
        .build();
  }

  @Bean
  @Order(-110)
  OncePerRequestFilter requestBoundary() {
    return new OncePerRequestFilter() {
      @Override
      protected void doFilterInternal(
          HttpServletRequest request, HttpServletResponse response, FilterChain chain)
          throws IOException, ServletException {
        String requestId = UUID.randomUUID().toString();
        long started = System.nanoTime();
        response.setHeader("X-Request-ID", requestId);
        if (request.getRequestURI().startsWith("/api/"))
          response.setHeader("Cache-Control", "private, no-store");
        String method = request.getMethod();
        if (!Set.of("GET", "HEAD", "OPTIONS").contains(method)) {
          String origin = request.getHeader("Origin");
          if (origin == null && request.isSecure()) {
            String ref = request.getHeader("Referer");
            if (ref != null)
              try {
                URI u = URI.create(ref);
                origin = u.getScheme() + "://" + u.getAuthority();
              } catch (Exception ignored) {
              }
          }
          var allowed =
              new HashSet<>(
                  List.of(
                      Identity.publicUrl(),
                      "http://127.0.0.1:8080",
                      "http://localhost:8080",
                      "http://127.0.0.1:5173",
                      "http://localhost:5173"));
          String deploy = System.getenv("VERCEL_URL");
          if (deploy != null) allowed.add("https://" + deploy);
          if (Identity.PRODUCTION) allowed.removeIf(s -> s.startsWith("http:"));
          if (!request.getRequestURI().equals("/api/engine")
              && ((origin != null && !allowed.contains(origin))
                  || (Identity.PRODUCTION && origin == null))) {
            response.setStatus(403);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"This request origin is not allowed.\"}");
            return;
          }
          if (request.getContentLengthLong() > 16384) {
            response.setStatus(413);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Request is too large.\"}");
            return;
          }
          byte[] bytes = request.getInputStream().readNBytes(16385);
          if (bytes.length > 16384) {
            response.setStatus(413);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Request is too large.\"}");
            return;
          }
          request =
              new HttpServletRequestWrapper(request) {
                final java.io.ByteArrayInputStream body = new java.io.ByteArrayInputStream(bytes);

                @Override
                public ServletInputStream getInputStream() {
                  return new ServletInputStream() {
                    @Override
                    public int read() {
                      return body.read();
                    }

                    @Override
                    public int read(byte[] buffer, int offset, int length) {
                      return body.read(buffer, offset, length);
                    }

                    @Override
                    public boolean isFinished() {
                      return body.available() == 0;
                    }

                    @Override
                    public boolean isReady() {
                      return true;
                    }

                    @Override
                    public void setReadListener(ReadListener listener) {
                      throw new UnsupportedOperationException("Synchronous API request.");
                    }
                  };
                }

                @Override
                public java.io.BufferedReader getReader() {
                  return new java.io.BufferedReader(
                      new java.io.InputStreamReader(
                          getInputStream(), java.nio.charset.StandardCharsets.UTF_8));
                }

                @Override
                public long getContentLengthLong() {
                  return bytes.length;
                }

                @Override
                public int getContentLength() {
                  return bytes.length;
                }
              };
        }
        try {
          chain.doFilter(request, response);
        } finally {
          Object pattern =
              request.getAttribute(
                  "org.springframework.web.servlet.HandlerMapping.bestMatchingPattern");
          if (Identity.PRODUCTION && request.getRequestURI().startsWith("/api/"))
            org.slf4j.LoggerFactory.getLogger("lot.requests")
                .info(
                    "{}",
                    Json.write(
                        Json.obj(
                            "request_id",
                            requestId,
                            "method",
                            method,
                            "route",
                            pattern == null ? "unmatched" : pattern.toString(),
                            "status",
                            response.getStatus(),
                            "duration_ms",
                            (System.nanoTime() - started) / 1_000_000)));
        }
      }
    };
  }
}
