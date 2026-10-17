package com.lot;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LotApplication {
  public static void main(String[] args) {
    var defaults = new HashMap<String, Object>();
    String database = System.getenv("DATABASE_URL");
    if (database == null || database.isBlank())
      throw new IllegalStateException(
          "DATABASE_URL is required; use the isolated local PostgreSQL service for development.");
    if (database.startsWith("jdbc:")) defaults.put("spring.datasource.url", database);
    else {
      URI uri = URI.create(database);
      if (!"postgres".equals(uri.getScheme()) && !"postgresql".equals(uri.getScheme()))
        throw new IllegalStateException("PostgreSQL DATABASE_URL is required.");
      String[] credentials = uri.getRawUserInfo().split(":", 2);
      defaults.put(
          "spring.datasource.url",
          "jdbc:postgresql://"
              + uri.getHost()
              + ":"
              + (uri.getPort() < 0 ? 5432 : uri.getPort())
              + uri.getRawPath()
              + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()));
      defaults.put(
          "spring.datasource.username", URLDecoder.decode(credentials[0], StandardCharsets.UTF_8));
      defaults.put(
          "spring.datasource.password",
          credentials.length > 1 ? URLDecoder.decode(credentials[1], StandardCharsets.UTF_8) : "");
    }
    var app = new SpringApplication(LotApplication.class);
    app.setDefaultProperties(defaults);
    app.run(args);
  }
}
