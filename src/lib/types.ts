export type Interest = {
  id: string;
  name: string;
  parent_id: string | null;
  hue: number;
  week_count: number;
  people: number;
};

/** 1 = curto, 2 = é minha vida */
export type Level = 1 | 2;
export type Levels = Record<string, Level>;

export type MatchRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  interest_id: string;
  level: Level;
};
