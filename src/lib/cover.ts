// Почти квадратные обложки (например, коробки Nintendo DS и 3DS — чуть выше квадрата)
// заполняют квадратную рамку целиком, немного срезая верх и низ.
// Остальные встают целиком, а поля заполняет их размытая копия.
export const NEAR_SQUARE = { min: 0.85, max: 1.18 };
export const isNearSquare = (w: number, h: number) => {
  const r = w / h;
  return r >= NEAR_SQUARE.min && r <= NEAR_SQUARE.max;
};
