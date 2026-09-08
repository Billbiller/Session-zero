"use client";

/** A plain window.print() trigger for the character-sheet print view
 * (app/characters/[id]/page.tsx). Its own wrapper in that page carries
 * print:hidden, so this button itself never shows up in the printed
 * output -- only the character sheet content below it does. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="underline"
    >
      Print
    </button>
  );
}
