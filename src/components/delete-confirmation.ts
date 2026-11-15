import { deleteConfirmationSchema } from "@/lib/shared/schemas";

/** Same rule the server enforces (SPEC §4.2): the text must be exactly "delete". */
export function isDeleteConfirmed(text: string): boolean {
  return deleteConfirmationSchema.safeParse({ confirm: text }).success;
}
