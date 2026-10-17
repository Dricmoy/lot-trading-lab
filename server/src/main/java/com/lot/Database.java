package com.lot;

import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
final class Database {
  final JdbcTemplate jdbc;
  final TransactionTemplate transactions;

  Database(JdbcTemplate jdbc, TransactionTemplate transactions) {
    this.jdbc = jdbc;
    this.transactions = transactions;
  }

  <T> T tx(Supplier<T> fn) {
    return transactions.execute(status -> fn.get());
  }

  <T> T readSnapshot(Supplier<T> fn) {
    var snapshot = new TransactionTemplate(transactions.getTransactionManager());
    snapshot.setReadOnly(true);
    snapshot.setIsolationLevel(
        org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
    return snapshot.execute(status -> fn.get());
  }

  List<Map<String, Object>> rows(String sql, Object... args) {
    return jdbc.query(sql, (rs, index) -> row(rs), args);
  }

  Map<String, Object> one(String sql, Object... args) {
    var rows = rows(sql, args);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  long count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Long.class, args);
  }

  void update(String sql, Object... args) {
    jdbc.update(sql, args);
  }

  static Map<String, Object> row(ResultSet rs) throws SQLException {
    var out = new LinkedHashMap<String, Object>();
    var metadata = rs.getMetaData();
    for (int i = 1; i <= metadata.getColumnCount(); i++) {
      Object v = rs.getObject(i);
      if ("jsonb".equals(metadata.getColumnTypeName(i))
          || "json".equals(metadata.getColumnTypeName(i)))
        v = Json.MAPPER.readValue(rs.getString(i), Object.class);
      else if (v instanceof Timestamp t) v = t.toInstant().toString();
      else if (v instanceof OffsetDateTime t) v = t.toInstant().toString();
      else if (v instanceof UUID) v = v.toString();
      out.put(metadata.getColumnLabel(i), v);
    }
    return out;
  }

  Map<String, Object> lockAccount(String id) {
    var row = one("SELECT * FROM trading_account WHERE id=?::uuid FOR UPDATE", id);
    if (row == null) throw new ApiException(401, "Open your workspace first.");
    return row;
  }
}
