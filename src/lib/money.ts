export type Currency = string;

/** Integer cents, never a float, and the currency always travels with it. */
export type Money = {
	cents: number;
	currency: Currency;
};

export function money(cents: number, currency: Currency = 'USD'): Money {
	if (!Number.isInteger(cents)) throw new Error(`money() needs integer cents, got ${cents}`);
	return { cents, currency };
}

function assertSameCurrency(a: Money, b: Money, verb: string): void {
	if (a.currency !== b.currency) {
		throw new Error(`cannot ${verb} ${a.currency} and ${b.currency}`);
	}
}

export function addMoney(a: Money, b: Money): Money {
	assertSameCurrency(a, b, 'add');
	return money(a.cents + b.cents, a.currency);
}

export function compareMoney(a: Money, b: Money): number {
	assertSameCurrency(a, b, 'compare');
	return a.cents - b.cents;
}

export function formatMoney(value: Money): string {
	const symbol = value.currency === 'USD' ? '$' : `${value.currency} `;
	const negative = value.cents < 0;
	const absolute = Math.abs(value.cents);
	const whole = Math.floor(absolute / 100);
	const fraction = String(absolute % 100).padStart(2, '0');
	return `${negative ? '-' : ''}${symbol}${whole}.${fraction}`;
}
