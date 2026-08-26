import type { Episode, Series } from './types';

function eps(seriesId: string, season: number, entries: [string, string, number][]): Episode[] {
	return entries.map(([title, synopsis, runtimeMinutes], i) => ({
		id: `${seriesId}-s${season}e${i + 1}`,
		number: i + 1,
		title,
		synopsis,
		runtimeMinutes
	}));
}

export const series: Series[] = [
	{
		kind: 'series',
		id: 'harbor-of-echoes',
		title: 'Harbor of Echoes',
		tagline: 'Every ship that never arrived is still out there.',
		synopsis:
			'In a fog-bound port town, the harbormaster’s new apprentice learns her real job: logging the ships that arrive decades after they were declared lost, crews unaware any time has passed.',
		year: 2022,
		genres: ['Mystery', 'Fantasy'],
		rating: 8.7,
		maturity: 'TV-14',
		cast: ['Odette Lam', 'Bram Kelleher', 'Nia Solano', 'Viktor Roth'],
		theme: { hue: 205, hue2: 260 },
		creator: 'Maeve Corcoran',
		seasons: [
			{
				number: 1,
				year: 2022,
				episodes: eps('harbor-of-echoes', 1, [
					[
						'The Ledger',
						'Wren takes the apprentice post and meets the ship that made her predecessor quit.',
						52
					],
					[
						'Thirty Years Late',
						'A trawler lost in 1992 docks at dawn; its captain asks to call a number long disconnected.',
						49
					],
					[
						'Manifest',
						'The harbor’s sealed manifest room holds a page with Wren’s name on it.',
						51
					],
					[
						'The Pilot’s Wife',
						'A returning ferry forces the town to confront who waited and who moved on.',
						54
					],
					['Dead Reckoning', 'Wren charts the fog bank and finds it has a tide of its own.', 50],
					[
						'First Light',
						'The harbormaster reveals the one rule Wren must never break — as a ship breaks it.',
						58
					]
				])
			},
			{
				number: 2,
				year: 2023,
				episodes: eps('harbor-of-echoes', 2, [
					['Signal Fires', 'The town lights the old beacons for the first time in a century.', 51],
					[
						'The Empty Berth',
						'A ship arrives with no crew at all, and the manifest room starts writing itself.',
						53
					],
					['Undertow', 'Wren rows into the fog after a departing silhouette she recognizes.', 49],
					[
						'Salvage Rights',
						'An outside company claims a returned wreck, testing the harbor’s oldest pact.',
						55
					],
					['The Long Watch', 'The harbormaster’s own logged year is called due.', 52],
					['Ebb', 'Wren must choose between closing the harbor and becoming it.', 61]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'the-lantern-office',
		title: 'The Lantern Office',
		tagline: 'Municipal department of miracles, est. 1911.',
		synopsis:
			'A workplace comedy about the city bureau that licenses the impossible: ghost tenancies, prophetic dreams, one very persistent dragon in a parking structure — all processed in triplicate.',
		year: 2020,
		genres: ['Comedy', 'Fantasy'],
		rating: 8.2,
		maturity: 'TV-14',
		cast: ['Gus Okoye', 'Marnie Fitch', 'Deepa Rao', 'Silas Crump'],
		theme: { hue: 60, hue2: 290 },
		creator: 'Toby Anand',
		seasons: [
			{
				number: 1,
				year: 2020,
				episodes: eps('the-lantern-office', 1, [
					[
						'Form 7-B (Apparitions)',
						'New hire Prue learns the filing system is alive, and it holds grudges.',
						27
					],
					[
						'The Dragon Variance',
						'Level 3 of the Elm Street garage requests a zoning exception.',
						26
					],
					['Sick Day', 'The office plant prophesies a Tuesday no one wants.', 25],
					['Audit Season', 'A downtown ghost applies for rent control.', 28],
					['The Wishing Well Recall', 'A defective wishing well grants everything literally.', 26],
					[
						'Holiday Party',
						'The annual party is haunted, which is normal, but also catered, which is not.',
						30
					]
				])
			},
			{
				number: 2,
				year: 2021,
				episodes: eps('the-lantern-office', 2, [
					[
						'Reorg',
						'A new director wants the impossible digitized. The filing system objects.',
						27
					],
					['Twinned Tuesdays', 'The same Tuesday keeps arriving; payroll is furious.', 26],
					['Public Comment', 'A town hall about the dragon goes exactly as expected.', 25],
					['The Basement Census', 'Someone has to count what lives below sub-level 4.', 29],
					['Prue vs. the Prophecy', 'The office plant’s Tuesday finally comes due.', 31]
				])
			},
			{
				number: 3,
				year: 2023,
				episodes: eps('the-lantern-office', 3, [
					['Grand Reopening', 'The bureau returns from hiatus to a backlog of 3,000 miracles.', 27],
					[
						'Interdepartmental',
						'The Lantern Office loans Prue to Sanitation. Sanitation is not ready.',
						26
					],
					[
						'The Long Lunch',
						'Gus’s retirement lunch enters its fourth hour, and possibly another decade.',
						28
					],
					['Permit Denied', 'The dragon’s appeal reaches the city council at last.', 30],
					['Lights Out', 'A blackout frees everything the office ever filed.', 33]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'sovereign-creek',
		title: 'Sovereign Creek',
		tagline: 'The water rights war has a body count.',
		synopsis:
			'A modern western about two ranching families, one drying river, and the county judge caught between them — who happens to be daughter of one house and widow of the other.',
		year: 2019,
		genres: ['Drama', 'Thriller'],
		rating: 8.9,
		maturity: 'TV-MA',
		cast: ['Ramona Vasquez', 'Earl Tennant', 'Josiah Blackfeather', 'Kit Munroe'],
		theme: { hue: 35, hue2: 200 },
		creator: 'Delia Fontaine',
		endYear: 2022,
		seasons: [
			{
				number: 1,
				year: 2019,
				episodes: eps('sovereign-creek', 1, [
					[
						'Headwaters',
						'Judge Vasquez rules on the diversion case that splits the valley — and her family.',
						58
					],
					[
						'Dry Season',
						'The Tennants find their upstream gauge tampered with; blame travels fast.',
						55
					],
					[
						'The Auction',
						'A bankrupt neighbor’s land goes up for sale, and both houses want the water under it.',
						56
					],
					['Firebreak', 'A grass fire forces enemies onto the same ditch line for one night.', 57],
					['Appropriation', 'A state inspector arrives with questions older than the county.', 54],
					['The Weir', 'Someone dynamites the creek’s headgate. Nobody sleeps.', 62]
				])
			},
			{
				number: 2,
				year: 2020,
				episodes: eps('sovereign-creek', 2, [
					['High Water', 'A flood year should mean peace. It means new leverage.', 56],
					[
						'Mineral Rights',
						'A drilling outfit courts the Munroe ranch with money that smells wrong.',
						55
					],
					['Recusal', 'Ramona is asked to step down from the case that defines her.', 57],
					['The Long Fence', 'An old survey error redraws every boundary in the valley.', 58],
					[
						'Winter Kill',
						'A blizzard traps both families at the creek house with one thawed truth.',
						63
					]
				])
			},
			{
				number: 3,
				year: 2022,
				episodes: eps('sovereign-creek', 3, [
					[
						'Adjudication',
						'The state finally rules on the creek. Nobody gets what they wanted.',
						57
					],
					['Grandfathered', 'Earl’s deathbed confession reopens a fifty-year-old claim.', 56],
					['The Reservoir', 'A dam proposal would end the war by drowning the valley.', 58],
					['Quiet Title', 'Ramona discovers whose name is really on the original deed.', 59],
					['Confluence', 'The families meet at the headwaters one last time.', 66]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'orbital-decay',
		title: 'Orbital Decay',
		tagline: 'Twelve crew. Eight seats home.',
		synopsis:
			'When a resupply failure strands a research station’s crew with a shrinking window to evacuate, the mission becomes a slow-burn study of loyalty, rationing, and who decides who descends.',
		year: 2023,
		genres: ['Sci-Fi', 'Drama'],
		rating: 8.5,
		maturity: 'TV-MA',
		cast: ['Commander Aja Toure', 'Miklos Ferency', 'Dr. Sun-hi Park', 'Bruno Vieira'],
		theme: { hue: 235, hue2: 175 },
		creator: 'Owen Castellan',
		seasons: [
			{
				number: 1,
				year: 2023,
				episodes: eps('orbital-decay', 1, [
					[
						'Window',
						'The resupply capsule tumbles past the station. The math starts immediately.',
						47
					],
					['Manifest Weight', 'Every kilogram is argued. Every argument is personal.', 45],
					['The Botanist', 'Park’s greenhouse becomes the most political room in orbit.', 46],
					['Downlink', 'Ground control’s plan leaks before the commander can soften it.', 48],
					['EVA', 'A repair walk buys time and costs trust.', 50],
					['Ballast', 'The first four seats are assigned.', 52],
					['Perigee', 'The station dips low enough to feel the atmosphere breathe.', 49],
					['Eight', 'The capsule undocks. The story stays aboard.', 55]
				])
			},
			{
				number: 2,
				year: 2025,
				episodes: eps('orbital-decay', 2, [
					[
						'Aftermath',
						'Four remain aloft as the world debates whether they were left or they stayed.',
						47
					],
					['Relay', 'An amateur radio operator becomes the crew’s only honest channel.', 46],
					[
						'The Second Window',
						'A rival agency offers rescue with strings woven into the tether.',
						48
					],
					['Museum Piece', 'The station is declared a heritage site while still inhabited.', 45],
					['Deorbit', 'The final burn is scheduled. Not everyone boards.', 58]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'the-marrow-archive',
		title: 'The Marrow Archive',
		tagline: 'Check out any book. Return what it takes.',
		synopsis:
			'A horror anthology set in a subscription library where each borrowed volume exacts a private price. The night archivist keeps the accounts — and season by season, loses track of her own.',
		year: 2021,
		genres: ['Horror', 'Mystery'],
		rating: 7.9,
		maturity: 'TV-MA',
		cast: ['Hester Quill', 'Ambrose Tate', 'Fen Alderwood'],
		theme: { hue: 275, hue2: 15 },
		creator: 'Solomon Reyes',
		seasons: [
			{
				number: 1,
				year: 2021,
				episodes: eps('the-marrow-archive', 1, [
					['Late Fees', 'A widower borrows a book of hours; the hours are not his own.', 41],
					['The Lending Tooth', 'A collector discovers what the Archive means by a deposit.', 39],
					['Marginalia', 'Notes in a returned novel predict its next reader precisely.', 42],
					['The Unabridged', 'A scholar demands the complete edition. He is warned once.', 40],
					['Interlibrary Loan', 'Another archive requests a trade: one book, one librarian.', 43],
					['Renewal', 'Hester’s own card comes up for renewal, and the terms have changed.', 47]
				])
			},
			{
				number: 2,
				year: 2024,
				episodes: eps('the-marrow-archive', 2, [
					[
						'New Acquisitions',
						'A donated estate arrives with one crate no inventory will hold.',
						41
					],
					[
						'The Children’s Section',
						'A picture book only some visitors can see is suddenly popular.',
						40
					],
					[
						'Silence Policy',
						'A patron who won’t stop talking meets the reading room’s enforcement.',
						39
					],
					[
						'Special Collections',
						'Ambrose finds the shelf where the Archive keeps its librarians.',
						44
					],
					['Closing Time', 'Hester balances the year’s ledger with the only currency left.', 49]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'copper-and-salt',
		title: 'Copper & Salt',
		tagline: 'Two kitchens. One street. No mercy.',
		synopsis:
			'A warm-hearted dramedy about rival family restaurants — one a copper-pot curry house, one a salt-crust bakery — forced to share a wall, a delivery alley, and eventually a catering contract.',
		year: 2018,
		genres: ['Comedy', 'Drama'],
		rating: 8.0,
		maturity: 'TV-14',
		cast: ['Rukmini Chandra', 'Big Sal Marino', 'Tunde Fashola', 'Perla Marino'],
		theme: { hue: 45, hue2: 160 },
		creator: 'Priya Venkatesan',
		endYear: 2021,
		seasons: [
			{
				number: 1,
				year: 2018,
				episodes: eps('copper-and-salt', 1, [
					[
						'The Wall',
						'A renovation reveals the restaurants share more than a load-bearing wall.',
						31
					],
					['Lunch Rush', 'A food blogger reviews both kitchens in one sentence. War follows.', 29],
					[
						'The Alley Accord',
						'Delivery schedules require diplomacy neither family possesses.',
						30
					],
					['Spice Levels', 'Rukmini’s new menu item mysteriously appears next door, salted.', 28],
					[
						'The Health Inspector',
						'A surprise inspection unites the street for exactly one afternoon.',
						30
					],
					['Family Meal', 'A blackout strands both staffs with one working stove.', 34]
				])
			},
			{
				number: 2,
				year: 2019,
				episodes: eps('copper-and-salt', 2, [
					[
						'The Contract',
						'A city festival wants one caterer. The street submits two bids stapled together.',
						30
					],
					[
						'Sourdough Sabotage',
						'Sal’s starter goes missing; suspicion has a shortlist of one.',
						29
					],
					['The Apprentice Swap', 'Tunde and Perla trade kitchens for a week on a bet.', 31],
					['Critics’ Table', 'The blogger returns with a fork and an agenda.', 28],
					['Two Menus', 'The festival arrives, and the stapled bid comes due.', 35]
				])
			},
			{
				number: 3,
				year: 2021,
				episodes: eps('copper-and-salt', 3, [
					[
						'Under New Management',
						'A restaurant group offers to buy the block. Both families say no — differently.',
						30
					],
					['The Wedding', 'A double-booked banquet hall forces a shared wedding menu.', 32],
					[
						'Recipe Box',
						'Rukmini finds her grandmother’s recipes annotated in Sal’s mother’s hand.',
						31
					],
					['Closing Week', 'The street votes on the buyout as both kitchens cook their answer.', 36]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'the-verge-runners',
		title: 'The Verge Runners',
		tagline: 'Between the maps, there’s work.',
		synopsis:
			'A crew of couriers delivers cargo across the Verge — the unmapped seam between city-states where physics files no flight plan. Fast, funny, and quietly devastating when it wants to be.',
		year: 2024,
		genres: ['Sci-Fi', 'Action'],
		rating: 8.1,
		maturity: 'TV-14',
		cast: ['Jax Meridian', 'Ondine Vale', 'Crank', 'The Navigator'],
		theme: { hue: 185, hue2: 310 },
		creator: 'Basia Kowalczyk',
		seasons: [
			{
				number: 1,
				year: 2024,
				episodes: eps('the-verge-runners', 1, [
					[
						'Cold Open',
						'A simple medicine run turns into a three-border chase with a stowaway.',
						44
					],
					['The Toll', 'Every Verge crossing costs something. Today it wants a memory.', 42],
					['Deadhead', 'An empty return leg is never actually empty.', 43],
					[
						'The Cartel of Maps',
						'The crew is offered a chart of the Verge. Real ones know better.',
						45
					],
					['Crank’s Day Off', 'The engineer takes shore leave; the ship sulks.', 41],
					['Terminal Velocity', 'A rival crew races them through the seam’s narrowest fold.', 46],
					[
						'The Navigator’s Debt',
						'The one place the Navigator won’t fly is exactly where the job goes.',
						48
					]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'gilt',
		title: 'Gilt',
		tagline: 'Old money never dies. It delegates.',
		synopsis:
			'A razor-edged thriller following the forensic accountant embedded in a dynasty’s family office, pulling one gold thread that unravels four generations of beautiful fraud.',
		year: 2020,
		genres: ['Thriller', 'Drama'],
		rating: 8.6,
		maturity: 'TV-MA',
		cast: ['Imogen Clare', 'Aurelio Vance', 'Dot Whitlock', 'Ezra Stone'],
		theme: { hue: 80, hue2: 250 },
		creator: 'Felix Marlowe',
		endYear: 2023,
		seasons: [
			{
				number: 1,
				year: 2020,
				episodes: eps('gilt', 1, [
					[
						'Engagement Letter',
						'Imogen joins the Vance family office to find one missing million. She finds a system.',
						53
					],
					['The Foundation', 'Charity, it turns out, begins at home and stays there.', 51],
					['Passive Income', 'A shell company’s only asset is a person.', 52],
					['The Summer House', 'An off-books property hosts the family’s realest ledger.', 54],
					[
						'Materiality',
						'Imogen must decide what’s too small to report and too large to survive.',
						55
					],
					['Signing Authority', 'The patriarch offers Imogen a pen.', 58]
				])
			},
			{
				number: 2,
				year: 2023,
				episodes: eps('gilt', 2, [
					['Restatement', 'The family restates its history; the numbers refuse.', 52],
					['The Trustee', 'Dot’s loyalty is audited by both sides.', 51],
					['Cost Basis', 'What the dynasty paid for its start comes due with interest.', 53],
					['The Whistle', 'Imogen’s copy of everything develops a copy of its own.', 54],
					['Liquidation', 'Every empire converts to cash eventually. Or to testimony.', 59]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'wildlight',
		title: 'Wildlight',
		tagline: 'The forest is the oldest broadcast.',
		synopsis:
			'A lyrical documentary series following rangers, mycologists, and night photographers through one ancient forest across four seasons — and the bioluminescent bloom no one can explain.',
		year: 2025,
		genres: ['Documentary'],
		rating: 8.8,
		maturity: 'G',
		cast: ['Narrated by Estelle Mbeki'],
		theme: { hue: 130, hue2: 220 },
		creator: 'Piotr Andrzejewski',
		seasons: [
			{
				number: 1,
				year: 2025,
				episodes: eps('wildlight', 1, [
					[
						'Understory',
						'Winter reveals the forest’s wiring: roots, fungi, and a faint blue glow.',
						48
					],
					['Sap Rise', 'Spring floods the canopy with light and the rangers with questions.', 47],
					['The Bloom', 'Midsummer nights turn the valley floor into a second sky.', 49],
					['Fall Signal', 'As the bloom fades, the forest sends one last, unmistakable pulse.', 52]
				])
			}
		]
	},
	{
		kind: 'series',
		id: 'the-understudies',
		title: 'The Understudies',
		tagline: 'Never the lead. Always the story.',
		synopsis:
			'Backstage at a crumbling repertory theater, five perpetual understudies run the show nobody sees — covering egos, feuds, and one opening night that finally, catastrophically, needs them all.',
		year: 2021,
		genres: ['Comedy', 'Drama'],
		rating: 7.7,
		maturity: 'TV-14',
		cast: ['Bunny Aldous', 'Terrence Okafor', 'Mitzi Grand', 'Lev Abramov', 'Coral Beale'],
		theme: { hue: 330, hue2: 100 },
		creator: 'Coco Lindqvist',
		seasons: [
			{
				number: 1,
				year: 2021,
				episodes: eps('the-understudies', 1, [
					[
						'Places, Please',
						'Five covers, one flu season, and a lead who insists she’s fine. She is not fine.',
						29
					],
					['Off Book', 'Lev knows everyone’s lines except his own life.', 28],
					[
						'The Green Room Accords',
						'A truce over the last parking space reshapes the company.',
						27
					],
					['Previews', 'The director’s "minor changes" arrive four hours before curtain.', 30],
					['Opening Night', 'Everything that can go wrong does — and the understudies go on.', 34]
				])
			},
			{
				number: 2,
				year: 2022,
				episodes: eps('the-understudies', 2, [
					['Season Announcement', 'The theater bets its future on a musical nobody can sing.', 29],
					['The Swing', 'A new hire covers eight roles and disturbs the fragile ecosystem.', 28],
					['Tech Week', 'No one sleeps. One person weeps. The fog machine unionizes.', 30],
					['The Notice', 'A rave review names exactly one performer: the understudy.', 29],
					[
						'Closing Night',
						'The company learns which theaters survive and which become condos.',
						35
					]
				])
			}
		]
	}
];
