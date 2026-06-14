"use client";

import type { CallState } from "@/lib/constellation";

const LABEL: Record<CallState, string> = {
  idle: "התקשרי לאורח",
  dialing: "מחייגת…",
  live: "בשיחה",
  resolved: "הושלם ✓",
};

export default function CallButton(props: {
  state: CallState;
  disabled: boolean;
  onCall: () => void;
}) {
  const { state, disabled, onCall } = props;
  return (
    <button
      className="cta"
      data-state={state}
      disabled={disabled || state !== "idle"}
      onClick={onCall}
    >
      {state === "idle" ? (disabled ? "תצוגה בלבד" : `📞 ${LABEL.idle}`) : LABEL[state]}
    </button>
  );
}
