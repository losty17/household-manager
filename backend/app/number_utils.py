EPSILON = 1e-9
STOCK_DECIMALS = 6
PRICE_DECIMALS = 6


def round_decimal(value: float, decimals: int = STOCK_DECIMALS) -> float:
    rounded = round(float(value), decimals)
    return 0.0 if abs(rounded) <= EPSILON else rounded


def round_non_negative_decimal(value: float, decimals: int = STOCK_DECIMALS) -> float:
    normalized = round_decimal(value, decimals=decimals)
    return 0.0 if normalized < EPSILON else normalized


def round_price(value: float | None) -> float | None:
    if value is None:
        return None
    return round_decimal(value, decimals=PRICE_DECIMALS)


def is_positive(value: float) -> bool:
    return value > EPSILON


def is_less(a: float, b: float) -> bool:
    return a < (b - EPSILON)
