import { useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, LogOut, Settings, X } from "lucide-react";
import Dialog from "./Dialog";
import { api } from "./lib";
import { navigate } from "./navigation";
import { clearSession, useAppDispatch, useAppSelector } from "./store";

export default function AccountMenu() {
  const { user } = useAppSelector((s) => s.trading);
  const dispatch = useAppDispatch();
  const menu = useRef<HTMLDetailsElement>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const initials =
    user?.name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "G";
  function dismiss() {
    if (!pending) {
      setSettings(false);
      setCurrent("");
      setPassword("");
      setConfirmation("");
      setError("");
      setMessage("");
    }
  }
  async function signout() {
    setPending(true);
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      dispatch(clearSession());
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't log out. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <details
        className="account-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current) {
            menu.current.open = false;
            menu.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label="Account menu">
          <span className="account-initials">{initials}</span>
          <ChevronDown size={14} />
        </summary>
        <div className="account-dropdown">
          <strong>{user?.name || "Guest account"}</strong>
          <span>
            {user?.email || "Save your practice by creating an account."}
          </span>
          {user ? (
            <button
              onClick={() => {
                setSettings(true);
                setError("");
                if (menu.current) menu.current.open = false;
              }}
            >
              <Settings size={16} />
              Account settings
            </button>
          ) : (
            <>
              <button onClick={() => navigate("/signup")}>
                Create account
              </button>
              <button onClick={() => navigate("/login")}>Log in</button>
            </>
          )}
          <button onClick={signout} disabled={pending}>
            <LogOut size={16} />
            {pending ? "Logging out…" : user ? "Log out" : "Leave workspace"}
          </button>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
      {settings && (
        <Dialog titleId="settings-title" onClose={dismiss}>
          <button
            className="modal-close icon-button"
            aria-label="Close account settings"
            disabled={pending}
            onClick={dismiss}
          >
            <X size={20} />
          </button>
          <h2 id="settings-title">Your account</h2>
          <p>
            {user?.name}
            <br />
            {user?.email}
          </p>
          <h3>Change password</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setMessage("");
              if (password !== confirmation) {
                setError("Your new passwords don't match.");
                return;
              }
              setPending(true);
              try {
                const result = await api<{ message: string }>(
                  "/api/auth/password",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      current_password: current,
                      password,
                    }),
                  },
                );
                setMessage(result.message);
                setCurrent("");
                setPassword("");
                setConfirmation("");
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Couldn't change password.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            <label className="auth-field">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                required
                maxLength={256}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="auth-field">
              New password
              <span className="password-wrap">
                <input
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={256}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={
                    visible ? "Hide new password" : "Show new password"
                  }
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label className="auth-field">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={256}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="settings-success" role="status">
                {message}
              </p>
            )}
            <button className="primary" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
