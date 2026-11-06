import { describe, expect, it } from 'vitest';
import { addMoney, compareMoney, formatMoney, money } from './money';

describe('money', () => {
	it('refuses a non-integer amount', () => {
		expect(() => money(12.5)).toThrow(/integer cents/);
	});

	it('adds two amounts in the same currency', () => {
		expect(addMoney(money(1250), money(750))).toEqual(money(2000));
	});

	it('refuses to add across currencies', () => {
		expect(() => addMoney(money(1250), money(750, 'EUR'))).toThrow(/cannot add/);
	});

	it('orders amounts by their cents', () => {
		expect(compareMoney(money(100), money(200))).toBeLessThan(0);
		expect(compareMoney(money(200), money(200))).toBe(0);
		expect(compareMoney(money(300), money(200))).toBeGreaterThan(0);
	});

	it('formats dollars with two decimal places', () => {
		expect(formatMoney(money(8900))).toBe('$89.00');
		expect(formatMoney(money(5))).toBe('$0.05');
		expect(formatMoney(money(120000))).toBe('$1200.00');
	});

	it('formats a negative amount with the sign in front', () => {
		expect(formatMoney(money(-1500))).toBe('-$15.00');
	});

	it('names a non-dollar currency instead of pretending it is dollars', () => {
		expect(formatMoney(money(1000, 'EUR'))).toBe('EUR 10.00');
	});
});
