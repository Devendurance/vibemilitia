"use client";

import { useState } from "react";
import { sendFeedback } from "@/lib/betaTelemetry";

export function BetaFeedback({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );

  const submit = async () => {
    if (rating === 0 && message.trim().length === 0) return;
    setStatus("sending");
    const ok = await sendFeedback({ rating, message: message.trim() });
    setStatus(ok ? "sent" : "failed");
    if (ok) {
      window.setTimeout(() => {
        setOpen(false);
        setStatus("idle");
        setMessage("");
        setRating(0);
      }, 900);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`hud-button feedback-trigger${compact ? " feedback-trigger--compact" : ""}`}
        onClick={() => setOpen(true)}
        data-testid="beta-feedback-open"
      >
        BETA FEEDBACK
      </button>
      {open ? (
        <div
          className="feedback-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          data-testid="beta-feedback-dialog"
        >
          <div className="feedback-card">
            <div className="feedback-card__head">
              <span className="mono-label">BETA FEEDBACK // ANONYMOUS</span>
              <button
                type="button"
                className="hud-button"
                onClick={() => setOpen(false)}
              >
                CLOSE
              </button>
            </div>
            <h2 id="feedback-title" className="display">
              TELL US WHAT HAPPENED
            </h2>
            <p>
              No email, name or account is required. Do not include personal
              information. Reports are used only to improve the beta.
            </p>
            <div className="feedback-rating" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`feedback-rating__button${rating === value ? " is-active" : ""}`}
                  onClick={() => setRating(value)}
                  aria-pressed={rating === value}
                  aria-label={`${value} out of 5`}
                >
                  {value}
                </button>
              ))}
            </div>
            <textarea
              className="feedback-message"
              value={message}
              maxLength={600}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What felt good, what broke, or what should change?"
              rows={4}
              data-testid="beta-feedback-message"
            />
            <div className="feedback-card__foot">
              <span className="mono-label">
                {status === "sent"
                  ? "THANK YOU // SENT"
                  : status === "failed"
                    ? "SEND FAILED // TRY AGAIN"
                    : "NO PERSONAL DATA REQUIRED"}
              </span>
              <button
                type="button"
                className="online-primary online-primary--small"
                onClick={() => void submit()}
                disabled={
                  status === "sending" ||
                  (rating === 0 && message.trim().length === 0)
                }
                data-testid="beta-feedback-submit"
              >
                {status === "sending" ? "SENDING..." : "SEND FEEDBACK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
