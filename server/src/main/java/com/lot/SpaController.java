package com.lot;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
final class SpaController {
  @GetMapping({
    "/",
    "/app",
    "/demo",
    "/replay",
    "/replay/compare",
    "/replay/{id:[0-9a-fA-F-]{36}}",
    "/s/{id:[0-9a-fA-F-]{36}}",
    "/signup",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/about",
    "/privacy"
  })
  String page() {
    return "forward:/index.html";
  }
}
