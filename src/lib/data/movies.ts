import type { Movie } from './types';

export const movies: Movie[] = [
	{
		kind: 'movie',
		id: 'the-hollow-meridian',
		title: 'The Hollow Meridian',
		tagline: 'The map ends where she begins.',
		synopsis:
			'A deep-sea cartographer discovers a trench that appears on no chart and refuses to stay in one place. As her expedition descends, the crew realizes the trench is mapping them back.',
		year: 2023,
		genres: ['Sci-Fi', 'Thriller'],
		rating: 8.4,
		maturity: 'PG-13',
		cast: ['Ines Okafor', 'Tomas Reyes', 'Freja Lindqvist', 'Daniel Ashe'],
		theme: { hue: 220, hue2: 190 },
		runtimeMinutes: 128,
		director: 'Amara Sule'
	},
	{
		kind: 'movie',
		id: 'saltwater-elegy',
		title: 'Saltwater Elegy',
		tagline: 'Some tides never return what they take.',
		synopsis:
			'After a storm shutters their island ferry line, two estranged siblings spend one last summer keeping the family boat afloat — and finally say the things thirty years of silence buried.',
		year: 2021,
		genres: ['Drama', 'Romance'],
		rating: 7.9,
		maturity: 'PG-13',
		cast: ['Maren Voss', 'Callum Pryce', 'Sofia Andrade'],
		theme: { hue: 200, hue2: 250 },
		runtimeMinutes: 112,
		director: 'Elias Brandt'
	},
	{
		kind: 'movie',
		id: 'night-cartographers',
		title: 'Night Cartographers',
		tagline: 'Every city hides a second city.',
		synopsis:
			'A crew of urban explorers who map abandoned metro tunnels for thrill-seekers stumble onto a live signal in a station sealed since 1967 — and someone very much wants it to stay lost.',
		year: 2024,
		genres: ['Mystery', 'Thriller'],
		rating: 8.1,
		maturity: 'R',
		cast: ['Yusuf Demir', 'Petra Kovacs', 'Andre Boone', 'Lena Marsh'],
		theme: { hue: 280, hue2: 220 },
		runtimeMinutes: 119,
		director: 'Noor Haddad'
	},
	{
		kind: 'movie',
		id: 'a-furnace-in-winter',
		title: 'A Furnace in Winter',
		tagline: 'Warmth is the last thing they share.',
		synopsis:
			'In a snowbound company town, a foundry foreman and the auditor sent to close his plant wage a quiet war of ledgers, loyalty, and the one secret that could burn the whole valley down.',
		year: 2019,
		genres: ['Drama'],
		rating: 8.6,
		maturity: 'R',
		cast: ['Gregor Malin', 'Adaeze Nwosu', 'Henrik Dahl'],
		theme: { hue: 40, hue2: 230 },
		runtimeMinutes: 141,
		director: 'Paulina Reyes'
	},
	{
		kind: 'movie',
		id: 'the-last-arcade-on-earth',
		title: 'The Last Arcade on Earth',
		tagline: 'Insert coin to continue.',
		synopsis:
			'When the world’s final arcade is slated for demolition, its eccentric regulars stage an increasingly absurd tournament to save it — with a prize none of them actually own.',
		year: 2022,
		genres: ['Comedy'],
		rating: 7.4,
		maturity: 'PG',
		cast: ['Milo Tran', 'Bec Sanders', 'Ophelia Grant', 'Roy Castellano'],
		theme: { hue: 320, hue2: 60 },
		runtimeMinutes: 98,
		director: 'Dev Kapoor'
	},
	{
		kind: 'movie',
		id: 'orchard-of-glass',
		title: 'Orchard of Glass',
		tagline: 'Handle every memory with care.',
		synopsis:
			'A grieving glassblower inherits her mother’s orchard and finds every tree hung with blown-glass fruit — each one holding a memory her mother chose not to keep.',
		year: 2020,
		genres: ['Fantasy', 'Drama'],
		rating: 8.0,
		maturity: 'PG',
		cast: ['Sana Iwata', 'Colm Brady', 'Vera Osei'],
		theme: { hue: 140, hue2: 300 },
		runtimeMinutes: 107,
		director: 'Lucia Ferro'
	},
	{
		kind: 'movie',
		id: 'redline-harvest',
		title: 'Redline Harvest',
		tagline: 'Drive fast. Owe faster.',
		synopsis:
			'A getaway driver trying to go straight takes one last job hauling stolen grain futures across three state lines, chased by the syndicate she shorted and the brother she left behind.',
		year: 2023,
		genres: ['Action', 'Thriller'],
		rating: 7.2,
		maturity: 'R',
		cast: ['Dana Kwan', 'Marcus Hale', 'Iggy Petrov'],
		theme: { hue: 25, hue2: 350 },
		runtimeMinutes: 104,
		director: 'Theo Marchetti'
	},
	{
		kind: 'movie',
		id: 'the-quiet-floor',
		title: 'The Quiet Floor',
		tagline: 'The 13th floor doesn’t appear in the elevator.',
		synopsis:
			'A night-shift custodian at a gleaming tech campus notices the building has one more floor at night than it does by day. Curiosity, it turns out, is a two-way door.',
		year: 2025,
		genres: ['Horror', 'Mystery'],
		rating: 7.8,
		maturity: 'R',
		cast: ['Jonah Reeve', 'Priya Nair', 'Selma Duarte'],
		theme: { hue: 260, hue2: 130 },
		runtimeMinutes: 96,
		director: 'Kasper Holt'
	},
	{
		kind: 'movie',
		id: 'wintersong-for-ada',
		title: 'Wintersong for Ada',
		tagline: 'A duet, fifty years apart.',
		synopsis:
			'A young cellist restoring a water-damaged concert hall discovers an unfinished score hidden in the walls and becomes obsessed with completing it — note by note, letter by letter.',
		year: 2018,
		genres: ['Romance', 'Drama'],
		rating: 7.7,
		maturity: 'PG',
		cast: ['Elif Aydin', 'Nathan Cole', 'Margarethe Blum'],
		theme: { hue: 230, hue2: 20 },
		runtimeMinutes: 121,
		director: 'June Okonkwo'
	},
	{
		kind: 'movie',
		id: 'the-brass-comet',
		title: 'The Brass Comet',
		tagline: 'The heist of the century — 1899.',
		synopsis:
			'A disgraced clockmaker assembles a crew of automaton engineers to steal an imperial airship during a comet festival, armed with gears, nerve, and eleven minutes of darkness.',
		year: 2021,
		genres: ['Fantasy', 'Action'],
		rating: 8.2,
		maturity: 'PG-13',
		cast: ['Rosalind Beck', 'Kofi Mensah', 'Aurelio Sanz', 'Wilhelmina Cross'],
		theme: { hue: 70, hue2: 270 },
		runtimeMinutes: 133,
		director: 'Hana Krejci'
	},
	{
		kind: 'movie',
		id: 'signal-to-noise',
		title: 'Signal to Noise',
		tagline: 'The static is listening.',
		synopsis:
			'A pirate radio DJ in 1984 begins receiving requests for songs that haven’t been written yet, from a caller who knows exactly how her week ends.',
		year: 2017,
		genres: ['Sci-Fi', 'Mystery'],
		rating: 7.9,
		maturity: 'PG-13',
		cast: ['Carmen Ruiz', 'Douglas Finn', 'Abeni Balogun'],
		theme: { hue: 300, hue2: 180 },
		runtimeMinutes: 101,
		director: 'Old Tremaine'
	},
	{
		kind: 'movie',
		id: 'the-cartwheel-year',
		title: 'The Cartwheel Year',
		tagline: 'Growing up is a contact sport.',
		synopsis:
			'Over one chaotic school year, a twelve-year-old gymnast, her retired-stuntman grandfather, and a very stubborn goat upend a small town’s idea of what a family team looks like.',
		year: 2016,
		genres: ['Comedy', 'Drama'],
		rating: 7.1,
		maturity: 'G',
		cast: ['Pip Halloran', 'Bernard Ash', 'Greta Yoon'],
		theme: { hue: 90, hue2: 40 },
		runtimeMinutes: 94,
		director: 'Sylvie Arnaud'
	},
	{
		kind: 'movie',
		id: 'meridian-zero',
		title: 'Meridian Zero',
		tagline: 'The longitude where time forgets.',
		synopsis:
			'An orbital salvage pilot answers a distress beacon from a station that was decommissioned before she was born — and finds its crew still on shift, still waiting for relief.',
		year: 2026,
		genres: ['Sci-Fi', 'Horror'],
		rating: 8.3,
		maturity: 'R',
		cast: ['Zadie Kirk', 'Rene Aubert', 'Kwame Dixon', 'Ilse Nordvik'],
		theme: { hue: 210, hue2: 280 },
		runtimeMinutes: 116,
		director: 'Amara Sule'
	},
	{
		kind: 'movie',
		id: 'paper-lantern-armistice',
		title: 'Paper Lantern Armistice',
		tagline: 'Peace, folded one lantern at a time.',
		synopsis:
			'In the last week of a border war, two enemy signal officers begin exchanging forbidden messages by lantern light — negotiating a private ceasefire their generals never signed.',
		year: 2015,
		genres: ['Drama', 'Romance'],
		rating: 8.5,
		maturity: 'PG-13',
		cast: ['Mei Watanabe', 'Aleksander Bruun', 'Farid Qadir'],
		theme: { hue: 15, hue2: 210 },
		runtimeMinutes: 126,
		director: 'Isadora Vane'
	},
	{
		kind: 'movie',
		id: 'the-vinegar-works',
		title: 'The Vinegar Works',
		tagline: 'Everything sours eventually.',
		synopsis:
			'A food critic returns to the pickling town she trashed in print a decade ago, only to be conscripted into saving its centuries-old vinegar house from a hostile buyout.',
		year: 2022,
		genres: ['Comedy', 'Romance'],
		rating: 6.9,
		maturity: 'PG-13',
		cast: ['Tallulah Reed', 'Emil Novak', 'Beatriz Campos'],
		theme: { hue: 55, hue2: 120 },
		runtimeMinutes: 103,
		director: 'Dev Kapoor'
	},
	{
		kind: 'movie',
		id: 'sixty-miles-of-static',
		title: 'Sixty Miles of Static',
		tagline: 'Out here, help is a rumor.',
		synopsis:
			'A storm-chasing radio repairwoman crossing the high plains picks up a hitchhiker who claims every tower she fixes goes silent an hour after she leaves. He’s keeping count.',
		year: 2019,
		genres: ['Thriller', 'Mystery'],
		rating: 7.5,
		maturity: 'R',
		cast: ['Georgia Stanton', 'Ray Okafor', 'Dolores Vega'],
		theme: { hue: 250, hue2: 40 },
		runtimeMinutes: 99,
		director: 'Marcus Ellery'
	},
	{
		kind: 'movie',
		id: 'the-orchid-protocol',
		title: 'The Orchid Protocol',
		tagline: 'Extinction has a backup plan.',
		synopsis:
			'When a seed vault engineer discovers her facility’s rarest specimen growing wild in a city median, she uncovers a rogue rewilding network — and the corporation hunting it.',
		year: 2024,
		genres: ['Action', 'Sci-Fi'],
		rating: 7.3,
		maturity: 'PG-13',
		cast: ['Noa Berman', 'Idris Fall', 'Katya Sokolova', 'Huang Lei'],
		theme: { hue: 150, hue2: 200 },
		runtimeMinutes: 122,
		director: 'Renata Cruz'
	},
	{
		kind: 'movie',
		id: 'below-the-salt',
		title: 'Below the Salt',
		tagline: 'Dinner is served. Knives out.',
		synopsis:
			'At a remote banquet celebrating a merger, the seating chart becomes a murder map when the guest of honor is found face-down in the consommé between the third and fourth course.',
		year: 2020,
		genres: ['Mystery', 'Comedy'],
		rating: 7.6,
		maturity: 'PG-13',
		cast: ['Hugo Braithwaite', 'Simone Duval', 'Percy Ngata', 'Alma Reyes'],
		theme: { hue: 340, hue2: 80 },
		runtimeMinutes: 108,
		director: 'Isadora Vane'
	},
	{
		kind: 'movie',
		id: 'children-of-the-antenna',
		title: 'Children of the Antenna',
		tagline: 'They grew up on the frequency.',
		synopsis:
			'A documentary tracing three generations of families who lived beneath a Cold War listening station, and the strange folklore that grew in its shadow — some of it, apparently, true.',
		year: 2018,
		genres: ['Documentary'],
		rating: 8.0,
		maturity: 'PG',
		cast: ['Narrated by Estelle Mbeki'],
		theme: { hue: 190, hue2: 320 },
		runtimeMinutes: 89,
		director: 'Piotr Andrzejewski'
	},
	{
		kind: 'movie',
		id: 'the-glass-harvest-1978',
		title: 'The Glass Harvest',
		tagline: 'The vineyard remembers.',
		synopsis:
			'A restored 1978 folk-horror classic: a wine dynasty’s heirs return for the harvest to find the vines grown through the family chapel — and the village oddly eager to help them stay.',
		year: 1978,
		genres: ['Horror', 'Fantasy'],
		rating: 8.8,
		maturity: 'R',
		cast: ['Vivian Thorn', 'Edmund Grieve', 'Rosa Milani'],
		theme: { hue: 110, hue2: 20 },
		runtimeMinutes: 117,
		director: 'Aldous Wren'
	}
];
