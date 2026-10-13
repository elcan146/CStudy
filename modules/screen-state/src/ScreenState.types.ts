export type ScreenStateEvent = {
  /** Screen is on */
  interactive: boolean;
  /** User got past the lockscreen (or there is none) */
  unlocked: boolean;
};
