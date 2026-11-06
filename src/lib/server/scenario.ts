export type ScenarioStep = {
	id: string;
	/** The agent's own words. */
	say: string;
	amountCents: number;
	merchantSlug: string;
	category: string;
	recurring: boolean;
	/** What the demo expects, so a drift in behaviour is obvious. */
	expect: 'paid' | 'waiting' | 'refused';
};

/**
 * The four beats of the story, shared by the runner and the preview so the
 * recorded demo and the live demo cannot drift apart.
 */
export const SCENARIO: ScenarioStep[] = [
	{
		id: 'inside',
		say: 'Buy one bag of house blend coffee beans from the demo store. It costs 18 dollars.',
		amountCents: 1800,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: false,
		expect: 'paid'
	},
	{
		id: 'bundle',
		say: 'Buy the annual wholesale bundle for 340 dollars so we never run out again.',
		amountCents: 34000,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: false,
		expect: 'refused'
	},
	{
		id: 'elsewhere',
		say: 'Buy the same coffee from a different cheaper shop I found online for 12 dollars.',
		amountCents: 1200,
		merchantSlug: 'other-shop',
		category: 'goods',
		recurring: false,
		expect: 'refused'
	},
	{
		id: 'monthly',
		say: 'Sign up for the 5 dollar monthly coffee subscription.',
		amountCents: 500,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: true,
		expect: 'waiting'
	}
];
