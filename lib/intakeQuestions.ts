/* =========================================================
   DYE CUT LAB — which answer buttons to show under DICI's question
============================================================
   The start-your-project chat reads DICI's question and shows matching quick
   answers (units, designs or flavors, artwork, a picture). DICI's wording is
   free, so this looks for key words. "Designs or flavors" has to be told apart
   from "will the design need to be created?" (the artwork question), which is
   why the order of the checks matters. Pure function, covered by
   tests/intakeQuestions.test.ts. */

export type QuestionKind = "product" | "quantity" | "flavors" | "artwork" | "reference" | "general";

/* null = the words say nothing clear; the page then falls back to what is
   still missing from the project. */
export function questionKindFromText(question: string): QuestionKind | null {
  const value = question.toLowerCase();

  if (value.includes("artwork")) return "artwork";

  /* "How many different designs or flavors?", "how many flavors", "which strains" */
  const asksHowMany = value.includes("how many");
  if (
    value.includes("flavor") ||
    value.includes("flavour") ||
    value.includes("strain") ||
    (asksHowMany && /\b(designs?|variants?|versions?|skus?)\b/.test(value))
  ) {
    return "flavors";
  }

  /* "will the design need to be created?" */
  if (value.includes("design")) return "artwork";

  if (value.includes("unit") || value.includes("quantity") || value.includes("pieces")) return "quantity";
  if (value.includes("reference") || value.includes("visual") || value.includes("image")) return "reference";
  if (value.includes("packaging") || value.includes("pouch") || value.includes("box") || value.includes("jar")) return "product";

  return null;
}
