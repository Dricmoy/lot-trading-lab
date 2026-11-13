import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import Site from "./Site";
import LegacyBanner from "./LegacyBanner";
import "./style.css";
import "./product.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <LegacyBanner />
      <Site />
    </Provider>
  </React.StrictMode>,
);
