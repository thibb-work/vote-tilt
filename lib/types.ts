export interface SessionRow {
  slug: string;
  options: string[];
  frozen: boolean;
  frozen_tallies: Record<string, number> | null;
  frozen_at: string | null;
  round_started: string;
  updated_at: string;
}
