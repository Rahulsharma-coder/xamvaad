"use client";

import { useState } from "react";

/**
 * The currently selected option id, defaulting to the first available one.
 *
 * Replaces `useState(options[0]?.id ?? "")`, which is wrong here in a way that
 * is invisible until it bites. `useState` reads its initial value once, on
 * mount, but these forms are rendered by server components whose data arrives
 * later: open the boards page with no boards, create one, and `router.refresh()`
 * re-renders the exam form with a populated list while the state stays "".
 *
 * A `<select>` whose value matches no option displays its *first* option, so
 * the admin sees "SSC" selected, submits, and gets "Validation failed" on a
 * field they can plainly see is filled in.
 *
 * Deriving the value on every render fixes that, and also covers the option
 * being deleted underneath a stale selection.
 */
export function useSelectedId(
  options: { id: string }[]
): [string, (id: string) => void] {
  const [chosen, setChosen] = useState("");
  const value = options.some((o) => o.id === chosen)
    ? chosen
    : (options[0]?.id ?? "");
  return [value, setChosen];
}
