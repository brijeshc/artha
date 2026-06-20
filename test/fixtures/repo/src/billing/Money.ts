export class Money {
  private readonly amount: number;

  constructor(amount: number) {
    this.amount = amount;
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  static zero(): Money {
    return new Money(0);
  }
}

export function formatMoney(money: Money): string {
  return String(money);
}

export const RATE = 5;
