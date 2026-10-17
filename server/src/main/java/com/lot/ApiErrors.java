package com.lot;

import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> domain(ApiException e) {
    var response = ResponseEntity.status(e.status);
    if (e.status == 429) response.header("Retry-After", "900");
    return response.body(Json.obj("error", e.getMessage()));
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class
  })
  ResponseEntity<?> malformed(Exception e) {
    return ResponseEntity.badRequest().body(Json.obj("error", "Check the request and try again."));
  }

  @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
  ResponseEntity<?> missing(Exception e) {
    return ResponseEntity.status(404)
        .body(Json.obj("error", "This page or resource was not found."));
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<?> method(Exception e) {
    return ResponseEntity.status(405).body(Json.obj("error", "Method not allowed."));
  }

  @ExceptionHandler(DataAccessException.class)
  ResponseEntity<?> database(DataAccessException e) {
    Throwable cause = e.getMostSpecificCause();
    String state = cause instanceof java.sql.SQLException sql ? sql.getSQLState() : "unknown";
    org.slf4j.LoggerFactory.getLogger("lot.errors")
        .warn("Database request failed: {} SQLSTATE {}", e.getClass().getSimpleName(), state);
    return ResponseEntity.status(503)
        .body(
            Json.obj(
                "error", "The service is temporarily unavailable. Please retry the same request."));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unexpected(Exception e) {
    org.slf4j.LoggerFactory.getLogger("lot.errors")
        .error("Request failed: {}", e.getClass().getSimpleName());
    return ResponseEntity.internalServerError()
        .body(Json.obj("error", "The service could not complete this request. Please retry."));
  }
}
