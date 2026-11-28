// Квадратные обложки заполняют рамку целиком (допуск — пара процентов на округление).
// Все остальные, включая коробки DS, ничем не обрезаются: встают целиком, а поля заполняет их размытая копия.
export const NEAR_SQUARE = { min: 0.97, max: 1.03 };
export const isNearSquare = (w: number, h: number) => {
  const r = w / h;
  return r >= NEAR_SQUARE.min && r <= NEAR_SQUARE.max;
};
