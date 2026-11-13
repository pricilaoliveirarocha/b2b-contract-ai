from decimal import Decimal


def plain(value: Decimal) -> str:
    """A decimal as plain text without trailing zeros or scientific notation: 250000, 12.5, 20."""
    return format(value.normalize(), "f")
