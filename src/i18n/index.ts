// timeflow i18n - Internationalization module

export type Language = 'nb' | 'en';

let currentLanguage: Language = 'nb';

export function setLanguage(lang: Language): void {
	currentLanguage = lang;
}

export function getLanguage(): Language {
	return currentLanguage;
}

export function getLocale(): string {
	return currentLanguage === 'nb' ? 'nb-NO' : 'en-GB';
}

/**
 * Get a translated string by key using dot notation
 * @example t('buttons.cancel') => "Avbryt" or "Cancel"
 */
export function t(key: string): string {
	const keys = key.split('.');
	let value: unknown = translations[currentLanguage];
	for (const k of keys) {
		if (typeof value === 'object' && value !== null && k in value) {
			value = (value as Record<string, unknown>)[k];
		} else {
			value = undefined;
			break;
		}
	}
	return (typeof value === 'string' ? value : key); // Fallback to key if not found
}

/**
 * Format a date according to current language
 * Norwegian: DD.MM.YYYY
 * English: YYYY-MM-DD (ISO)
 */
export function formatDate(date: Date, format: 'short' | 'long' = 'short'): string {
	if (currentLanguage === 'en') {
		// ISO format for English
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		if (format === 'long') {
			return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
		}
		return `${year}-${month}-${day}`;
	}
	// Norwegian format
	if (format === 'long') {
		return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
	}
	return date.toLocaleDateString('nb-NO');
}

/**
 * Format time according to current language (24h format for both)
 */
export function formatTime(date: Date, includeSeconds = false): string {
	const options: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
	};
	if (includeSeconds) options.second = '2-digit';
	return date.toLocaleTimeString(getLocale(), options);
}

/**
 * Get short day names for the current language
 */
export function getDayNamesShort(): string[] {
	return translations[currentLanguage].dates.dayNamesShort;
}

/**
 * Get the month name for a date in current language
 */
export function getMonthName(date: Date): string {
	return date.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
}

/**
 * Map from special day ID to translation key
 */
const specialDayTranslationMap: Record<string, string> = {
	'jobb': 'specialDays.work',
	'ferie': 'specialDays.vacation',
	'avspasering': 'specialDays.flexTimeOff',
	'egenmelding': 'specialDays.selfReportedSick',
	'sykemelding': 'specialDays.doctorSick',
	'velferdspermisjon': 'specialDays.welfareLeave',
	'kurs': 'specialDays.course',
	'studie': 'specialDays.study',
	'helligdag': 'specialDays.publicHoliday',
	'annet': 'specialDays.other',
};

/**
 * Translate a special day type name based on its ID
 * Falls back to the original name if no translation exists
 */
export function translateSpecialDayName(id: string, fallbackLabel?: string): string {
	const translationKey = specialDayTranslationMap[id.toLowerCase()];
	if (translationKey) {
		return t(translationKey);
	}
	return fallbackLabel || id;
}

/**
 * Map from annet template ID to translation key
 */
const annetTemplateTranslationMap: Record<string, string> = {
	'doctor': 'annet.doctor',
	'dentist': 'annet.dentist',
	'funeral': 'annet.funeral',
};

/**
 * Translate an annet template name based on its ID
 * Falls back to the original label if no translation exists
 */
export function translateAnnetTemplateName(id: string, fallbackLabel?: string): string {
	const translationKey = annetTemplateTranslationMap[id.toLowerCase()];
	if (translationKey) {
		return t(translationKey);
	}
	return fallbackLabel || id;
}

/**
 * Map from note type ID to translation key
 */
const noteTypeTranslationMap: Record<string, string> = {
	'daily': 'noteTypes.daily',
	'meeting': 'noteTypes.meeting',
	'project': 'noteTypes.project',
	'review': 'noteTypes.review',
	'reflection': 'noteTypes.reflection',
};

/**
 * Translate a note type name based on its ID
 * Falls back to the original label if no translation exists
 */
export function translateNoteTypeName(id: string, fallbackLabel?: string): string {
	const translationKey = noteTypeTranslationMap[id.toLowerCase()];
	if (translationKey) {
		return t(translationKey);
	}
	return fallbackLabel || id;
}

const translations: Record<Language, TranslationStrings> = {
	nb: {
		dates: {
			dayNamesShort: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
			dayNamesFull: ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'],
		},
		ui: {
			today: 'I dag',
			thisWeek: 'Denne uken',
			week: 'Uke',
			calendar: 'Kalender',
			statistics: 'Statistikk',
			history: 'Historikk',
			information: 'Informasjon',
			flextimeBalance: 'Fleksitidsaldo',
			hoursWorked: 'Timer arbeidet',
			hoursLogged: 'Timer logget',
			hours: 'Timer',
			dayGoal: 'Dagsmål',
			weekGoal: 'Ukemål',
			flextime: 'Fleksitid',
			activeTimers: 'Aktive timer',
			activeTimer: 'Aktiv timer (pågår)',
			ongoing: 'Pågående',
			total: 'Totalt',
			year: 'År',
			month: 'Måned',
			all: 'Alle',
			date: 'Dato',
			type: 'Type',
			start: 'Start',
			end: 'Slutt',
			duration: 'Varighet',
			fullDay: 'Hel dag',
			comment: 'Kommentar',
			optional: 'valgfritt',
			days: 'dager',
			goal: 'Mål',
			expected: 'Forventet',
			difference: 'Differanse',
			overWeekLimit: 'Over ukegrense',
			vsLastWeek: 'vs forrige uke',
			upcomingPlannedDays: 'Kommende planlagte dager',
			dailyBalance: 'Dagssaldo',
			runningBalance: 'Løpende saldo',
			noRegistration: 'Ingen registrering',
			noDataForDay: 'Ingen data for den dagen',
			addNewEntry: '+ Legg til ny oppføring',
			restPeriodWarning: 'Hviletid: Kun {hours} timer mellom arbeidsøkter (minimum {min} timer)',
			restPeriod: 'Hviletid',
			minimum: 'minimum',
			multipleDays: 'Flere dager',
			startDate: 'Startdato',
			endDate: 'Sluttdato',
			weeklyViewComingSoon: 'Ukesvisning - kommer snart',
		},
		status: {
			ok: 'OK',
			near: 'Nær',
			over: 'Over',
			onTarget: 'På mål',
			overTarget: 'Over mål',
			underTarget: 'Under mål',
			inProgress: 'Pågår',
			allLimitsOk: 'Alle grenser er OK.',
			withinLimits: 'Innenfor grensene',
			approachingLimits: 'Nærmer seg',
			systemStatus: 'Systemstatus',
			clickForDetails: 'klikk for detaljer',
			holidayNotLoaded: 'Helligdagsdata ikke lastet',
			activeTimers: 'aktive timer',
			entriesChecked: 'oppføringer sjekket',
			loadedPlannedDays: 'Lastet inn {count} planlagte dager',
		},
		buttons: {
			cancel: 'Avbryt',
			save: 'Lagre',
			delete: 'Slett',
			edit: 'Rediger',
			close: 'Lukk',
			add: 'Legg til',
			done: 'Ferdig',
			start: 'Start',
			stop: 'Stopp',
			confirm: 'Bekreft',
			export: 'Eksporter',
			import: 'Importer',
			preview: 'Forhåndsvis',
			list: 'Liste',
			heatmap: 'Heatmap',
			moveToMain: 'Flytt til hovedområde',
			moveToSidebar: 'Flytt til sidepanel',
		},
		menu: {
			logWork: 'Logg arbeidstimer',
			editWork: 'Rediger arbeidstid',
			registerSpecialDay: 'Registrer fravær',
			editPlannedDay: 'Rediger',
			addEntry: 'Legg til oppføring',
			deleteEntry: 'Slett oppføring',
			selectOption: 'Velg et alternativ fra menyen',
		},
		timeframes: {
			total: 'Totalt',
			year: 'År',
			month: 'Måned',
		},
		modals: {
			logWorkTitle: 'Logg arbeidstimer for',
			editWorkTitle: 'Rediger arbeidstid for',
			registerSpecialDayTitle: 'Registrer fravær',
			addEntryTitle: 'Legg til oppføring for',
			deleteEntryTitle: 'Slett oppføring',
			startTime: 'Starttid',
			endTime: 'Sluttid',
			startTimeFormat: 'Starttid (HH:MM):',
			endTimeFormat: 'Sluttid (HH:MM):',
			dayType: 'Type dag:',
			timePeriod: 'Tidsperiode:',
			from: 'Fra:',
			to: 'Til:',
			commentOptional: 'Kommentar (valgfritt):',
			commentPlaceholder: 'F.eks. "Ferie i Spania"',
			commentPlaceholders: {
				ferie: 'F.eks. "Ferie i Spania"',
				egenmelding: 'F.eks. "Hodepine"',
				sykemelding: 'F.eks. "Influensa"',
				velferdspermisjon: 'F.eks. "Legebesøk"',
				avspasering: 'F.eks. "Tidlig helg"',
				helligdag: 'F.eks. "1. mai"',
				kurs: 'F.eks. "React-kurs"',
				studie: 'F.eks. "Eksamensforberedelse"',
				halfday: 'F.eks. "Halv dag før ferie"',
				default: 'F.eks. "Kommentar"',
			},
			durationHint: 'Antall timer (f.eks. 3.5 for resten av dagen etter sykdom)',
			commentRequired: 'Kommentar påkrevd',
			commentTitle: 'Legg til kommentar',
			overtimeExplanation: 'Du har jobbet {hours} over dagsmålet.',
			commentPrompt: 'Vennligst forklar hvorfor:',
			skip: 'Hopp over',
		},
		validation: {
			endAfterStart: 'Sluttid må være etter starttid',
			invalidTime: 'Ugyldig tid (bruk format HH:MM, 00-23:00-59)',
			invalidTimePeriod: 'Ugyldig tidsperiode',
			invalidDateRange: 'Ugyldig datoperiode',
			overlappingEntry: 'Denne oppføringen overlapper med en eksisterende oppføring',
			endTimeNextDay: 'Sluttid satt til neste dag (før starttid)',
			invalidDuration: 'Ugyldig varighet',
			invalidTimeFormat: 'Ugyldig tidsformat. Bruk HH:MM format.',
			startTimeRequired: 'Starttid må fylles ut',
			invalidStartDateTime: 'Ugyldig startdato/tid',
			invalidEndDateTime: 'Ugyldig sluttdato/tid',
		},
		units: {
			day: 'dag',
			days: 'dager',
			hours: 'timer',
		},
		notifications: {
			added: 'Lagt til',
			updated: 'Oppdatert',
			deleted: 'Slettet',
			exported: 'Eksportert til CSV',
			saveError: 'Feil ved lagring av data',
			addedWorkTime: 'Lagt til {duration} timer arbeidstid for {date}',
			errorAddingWorkTime: 'Kunne ikke legge til arbeidstid',
			noWorkEntriesFound: 'Ingen arbeidstidsoppføringer funnet for denne datoen',
			entryUpdated: 'Oppføring oppdatert',
			fileNotFound: 'Fant ikke filen: {path}',
			sectionNotFound: 'Fant ikke seksjonen',
			codeBlockNotFound: 'Fant ikke kodeblokk i seksjonen',
			errorAddingSpecialDay: 'Kunne ikke legge til spesialdag',
			openedExistingNote: 'Åpnet eksisterende notat: {filename}',
			createdNote: 'Opprettet notat: {filename}',
			errorCreatingNote: 'Feil ved opprettelse av notat: {error}',
			addedHours: 'Lagt til {duration} timer for {date}',
			errorLoadingDashboard: 'Feil ved lasting av dashboard: {error}',
			errorImporting: 'Feil ved importering av data',
			errorDeletingEntry: 'Feil ved sletting av oppføring',
			errorUpdatingEntry: 'Feil ved oppdatering av oppføring',
		},
		confirm: {
			deleteEntry: 'Er du sikker på at du vil slette denne oppføringen?',
			deleteEntryFor: 'Slette oppføring for',
			overnightShiftTitle: 'Nattskift?',
			overnightShift: 'Sluttid er før starttid. Er dette et nattskift som går over midnatt?',
		},
		stats: {
			flextimeBalance: 'Fleksitidsaldo',
			hours: 'Timer',
			avgPerDay: 'Snitt/dag',
			avgPerWeek: 'Snitt/uke',
			workIntensity: 'Intensitet',
			ofNormalWeek: 'av normaluke',
			work: 'Jobb',
			weekendDaysWorked: 'Helgedager jobbet',
			flexTimeOff: 'Avspasering',
			vacation: 'Ferie',
			welfareLeave: 'Velferdspermisjon',
			selfReportedSick: 'Egenmelding',
			doctorSick: 'Sykemelding',
			study: 'Studiedag',
			course: 'Kursdag',
			totalBalance: 'Total saldo',
			weeklyHours: 'Uketimer',
			monthlyHours: 'Månedstimer',
			yearlyHours: 'Årstimer',
			target: 'Mål',
			weekPrefix: 'U',
		},
		specialDays: {
			work: 'Jobb',
			vacation: 'Ferie',
			flexTimeOff: 'Avspasering',
			selfReportedSick: 'Egenmelding',
			doctorSick: 'Sykemelding',
			welfareLeave: 'Velferdspermisjon',
			course: 'Kursdag',
			study: 'Studiedag',
			publicHoliday: 'Helligdag',
			other: 'Annet',
		},
		annet: {
			title: 'Annet',
			custom: 'Egendefinert',
			fullDay: 'Hel dag',
			saveAsTemplate: 'Lagre som mal',
			templateName: 'Mal-navn',
			templateIcon: 'Ikon',
			addTemplate: 'Legg til mal',
			editTemplate: 'Rediger mal',
			deleteTemplate: 'Slett mal',
			noTemplates: 'Ingen maler definert',
			selectTemplate: 'Velg mal eller egendefinert',
			description: 'Beskrivelse',
			fromTime: 'Fra',
			toTime: 'Til',
			templateDescription: 'Maler for "Annet"-fraværstype. Atferd bestemmes automatisk av om det er hel dag eller delvis fravær.',
			idDesc: 'Unik identifikator (små bokstaver, ingen mellomrom). Brukes i fil-formatet.',
			labelField: 'Navn',
			labelDesc: 'Visningsnavn i grensesnittet',
			iconField: 'Ikon',
			iconDesc: 'Emoji som vises sammen med malen',
			idRequired: 'ID er påkrevd',
			labelRequired: 'Navn er påkrevd',
			iconRequired: 'Ikon er påkrevd',
			duplicateId: 'En mal med denne ID-en finnes allerede',
			templatesSection: 'Annet-maler',
			templatesDesc: 'Maler for fleksible fraværstyper. Atferd bestemmes av om det er hel dag eller delvis fravær.',
			labelPlaceholder: 'Lege',
			// Default template names
			doctor: 'Lege',
			dentist: 'Tannlege',
			funeral: 'Begravelse',
		},
		common: {
			cancel: 'Avbryt',
			save: 'Lagre',
			delete: 'Slett',
			edit: 'Rediger',
			add: 'Legg til',
		},
		import: {
			title: 'Importer data',
			description: 'Importer tidsdata fra ulike formater. Støtter Timekeep JSON, CSV og JSON-arrays.',
			selectFile: 'Velg fil...',
			noFile: 'Ingen fil valgt',
			orPasteData: 'Eller lim inn data:',
			placeholder: 'Lim inn Timekeep JSON, CSV eller JSON-array her...\n\nEksempel CSV (norsk format):\nDato;Start;Slutt;Aktivitet\n25.11.2024;08:00;16:00;jobb\n26.11.2024;09:00;17:00;jobb',
			format: 'Format:',
			autoDetect: 'Auto-detekter',
			supportedFormats: 'Støttede formater:',
			noEntries: 'Ingen oppføringer å importere',
			entriesFound: 'oppføringer funnet',
			imported: 'Importerte',
			entries: 'oppføringer',
			skippedDuplicates: 'hoppet over',
			duplicates: 'duplikater',
			andMore: 'og',
			more: 'flere',
			errors: {
				invalidFormat: 'Ugyldig format',
				missingEntries: 'mangler "entries" array',
				missingFields: 'Mangler påkrevde felt',
				invalidStartTime: 'Ugyldig starttid',
				invalidEndTime: 'Ugyldig sluttid',
				csvNeedsHeader: 'CSV må ha minst en overskriftsrad og en datarad',
				jsonError: 'JSON-feil',
				unknownFormat: 'Kunne ikke gjenkjenne formatet. Støttede formater: Timekeep JSON, CSV, JSON Array',
				couldNotFindDateColumn: 'Kunne ikke finne dato-kolonne. Forventet: Dato, Date, Dag',
				couldNotFindStartColumn: 'Kunne ikke finne starttid-kolonne. Forventet: Start, Starttid, Fra',
				tooFewColumns: 'For få kolonner',
				missingDateOrTime: 'Mangler dato eller starttid',
				invalidDateFormat: 'Ugyldig datoformat. Bruk DD.MM.YYYY eller YYYY-MM-DD',
				invalidTimeFormat: 'Ugyldig tid. Bruk HH:MM',
				expectedJsonArray: 'Forventet en JSON-array',
				couldNotParseDateTime: 'Kunne ikke tolke dato/tid',
				entry: 'Oppføring',
				row: 'Rad',
				dateAutoCorrected: 'Ugyldig dato {date} ble autokorrigert til {corrected}',
			},
			warnings: 'Advarsler',
			errors_label: 'Feil',
			tableHeaders: {
				date: 'Dato',
				start: 'Start',
				end: 'Slutt',
				type: 'Type',
			},
		},
		export: {
			csvTooltip: 'Eksporter historikk til CSV-fil',
			noData: 'Ingen data å eksportere',
			success: 'Eksport fullført',
			selectMonth: 'Eksporter måned',
			month: 'Måned',
			allMonths: 'Alle måneder',
			date: 'Dato',
			type: 'Type',
			start: 'Start',
			end: 'Slutt',
			hours: 'Timer',
			flextime: 'Fleksitid',
			comment: 'Kommentar',
			monthlySummary: 'Månedlig oppsummering',
			totalHours: 'Totalt timer',
			totalFlextime: 'Total fleksitid',
			workDays: 'Arbeidsdager',
			avgDaily: 'Gjennomsnitt per dag',
			typeBreakdown: 'Fordeling per type',
			typeHeader: 'Type',
			daysHeader: 'Dager',
			hoursHeader: 'Timer',
		},
		settings: {
			language: 'Språk',
			languageDesc: 'Velg språk for grensesnittet',
			showWeekNumbers: 'Vis ukenummer',
			showWeekNumbersDesc: 'Vis ukenummer i kalender og uke-kortet (ISO 8601 ukenummer)',
			hideEmptyStats: 'Skjul tomme statistikker',
			hideEmptyStatsDesc: 'Skjul statistikker med 0 timer/dager',
			startingFlextimeBalance: 'Startbalanse fleksitid',
			startingFlextimeBalanceDesc: 'Fleksitidssaldo å starte med (bruk dette hvis du migrerer fra et annet system)',
			importData: 'Importer data',
			importDataDesc: 'Importer tidsdata fra ulike formater: Timekeep JSON, CSV (norsk/ISO datoformat), eller JSON-arrays',
			absenceTypesDesc: 'Opprett egendefinerte fraværskategorier med spesifikke fleksitid- og statistikkregler. Støtter fravær over flere dager. For enkeltstående fravær, bruk "Annet-maler" nedenfor.',
			addAbsenceType: 'Legg til fraværstype',
			overtimeComments: 'Overtidskommentarer',
			enableOvertimeComments: 'Krev kommentar ved overtid',
			enableOvertimeCommentsDesc: 'Krev kommentar når du stopper en timer og har jobbet mer enn dagsmålet + terskel',
			overtimeCommentThreshold: 'Kommentarkrav (timer over mål)',
			overtimeCommentThresholdDesc: 'Krev kommentar når dagstotal overstiger dagsmål + dette antall timer (standard: 0.5)',
			overtimeCommentEffectiveDate: 'Gjelder fra dato',
			overtimeCommentEffectiveDateDesc: 'Dato fra når kommentarkravet trer i kraft (eldre oppføringer påvirkes ikke)',
		},
		compliance: {
			title: 'Arbeidstidsgrenser',
			today: 'I dag',
			thisWeek: 'Denne uken',
			restPeriod: 'Hviletid',
			limit: 'grense',
			approaching: 'nærmer seg',
			exceeds: 'Overstiger',
			ok: 'OK',
			near: 'Nær',
			over: 'Over',
		},
		timer: {
			runningTimers: 'Pågående timer',
			noActiveTimers: 'Ingen aktive timer',
			started: 'Timer startet: {name}',
			stopped: 'Timer stoppet: {name} ({duration})',
			deleted: 'Timer slettet',
		},
		noteTypes: {
			daily: 'Daglig Notat',
			meeting: 'Møtenotat',
			project: 'Prosjektnotat',
			review: 'Ukesoppsummering',
			reflection: 'Refleksjonsnotat',
		},
		info: {
			specialDayTypes: 'Fraværstyper',
			workDaysGradient: 'Arbeidsdager - fargegradient',
			colorShowsFlextime: 'Fargen viser fleksitid i forhold til dagens mål',
			calendarContextMenu: 'Kalenderkontekstmeny',
			clickDayFor: 'Trykk på en dag i kalenderen for:',
			createDailyNote: 'Opprett daglig notat',
			editFlextimeManually: 'Rediger arbeidstid manuelt',
			registerSpecialDays: 'Registrer fravær',
			flextimeBalanceZones: 'Fleksitidsaldo - soner',
			green: 'Grønn',
			yellow: 'Gul',
			orange: 'Oransje',
			red: 'Rød',
			gray: 'Grå',
			to: 'til',
			weekNumberCompliance: 'Ukenummer - statusfarger',
			reachedGoal: 'Nådd mål',
			overGoal: 'Over mål',
			underGoal: 'Under mål',
			weekInProgress: 'Uke pågår',
			clickWeekForDetails: 'Trykk på ukenummer for detaljer.',
			publicHolidayDesc: 'Offentlig fridag - påvirker ikke fleksitid',
			halfDayDesc: 'Halv arbeidsdag ({hours}t) - reduserer ukemålet med {reduction}t',
			withdrawFromFlextime: 'Trekkes fra fleksitid',
			countsAsFlextime: 'Teller som fleksitid ved mer enn {hours}t',
			noFlextimeEffect: 'Påvirker ikke fleksitid',
			workRegisteredOnSpecialDay: 'Arbeid registrert på {dayType}',
		},
	},
	en: {
		dates: {
			dayNamesShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
			dayNamesFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		},
		ui: {
			today: 'Today',
			thisWeek: 'This Week',
			week: 'Week',
			calendar: 'Calendar',
			statistics: 'Statistics',
			history: 'History',
			information: 'Information',
			flextimeBalance: 'Flextime Balance',
			hoursWorked: 'Hours worked',
			hoursLogged: 'Hours logged',
			hours: 'Hours',
			dayGoal: 'Daily Goal',
			weekGoal: 'Weekly Goal',
			flextime: 'Flextime',
			activeTimers: 'Active timers',
			activeTimer: 'Active timer (in progress)',
			ongoing: 'Ongoing',
			total: 'Total',
			year: 'Year',
			month: 'Month',
			all: 'All',
			date: 'Date',
			type: 'Type',
			start: 'Start',
			end: 'End',
			duration: 'Duration',
			fullDay: 'Full day',
			comment: 'Comment',
			optional: 'optional',
			days: 'days',
			goal: 'Goal',
			expected: 'Expected',
			difference: 'Difference',
			overWeekLimit: 'Over weekly limit',
			vsLastWeek: 'vs last week',
			upcomingPlannedDays: 'Upcoming planned days',
			dailyBalance: 'Daily balance',
			runningBalance: 'Running balance',
			noRegistration: 'No registration',
			noDataForDay: 'No data for this day',
			addNewEntry: '+ Add new entry',
			restPeriodWarning: 'Rest period: Only {hours} hours between work sessions (minimum {min} hours)',
			restPeriod: 'Rest period',
			minimum: 'minimum',
			multipleDays: 'Multiple days',
			startDate: 'Start date',
			endDate: 'End date',
			weeklyViewComingSoon: 'Weekly view - coming soon',
		},
		status: {
			ok: 'OK',
			near: 'Near',
			over: 'Over',
			onTarget: 'On target',
			overTarget: 'Over target',
			underTarget: 'Under target',
			inProgress: 'In progress',
			allLimitsOk: 'All limits are OK.',
			withinLimits: 'Within limits',
			approachingLimits: 'Approaching',
			systemStatus: 'System Status',
			clickForDetails: 'click for details',
			holidayNotLoaded: 'Holiday data not loaded',
			activeTimers: 'active timers',
			entriesChecked: 'entries checked',
			loadedPlannedDays: 'Loaded {count} planned days',
		},
		buttons: {
			cancel: 'Cancel',
			save: 'Save',
			delete: 'Delete',
			edit: 'Edit',
			close: 'Close',
			add: 'Add',
			done: 'Done',
			start: 'Start',
			stop: 'Stop',
			confirm: 'Confirm',
			export: 'Export',
			import: 'Import',
			preview: 'Preview',
			list: 'List',
			heatmap: 'Heatmap',
			moveToMain: 'Move to main area',
			moveToSidebar: 'Move to sidebar',
		},
		menu: {
			logWork: 'Log work hours',
			editWork: 'Edit work time',
			registerSpecialDay: 'Register absence',
			editPlannedDay: 'Edit',
			addEntry: 'Add entry',
			deleteEntry: 'Delete entry',
			selectOption: 'Select an option from the menu',
		},
		timeframes: {
			total: 'Total',
			year: 'Year',
			month: 'Month',
		},
		modals: {
			logWorkTitle: 'Log work hours for',
			editWorkTitle: 'Edit work time for',
			registerSpecialDayTitle: 'Register absence',
			addEntryTitle: 'Add entry for',
			deleteEntryTitle: 'Delete entry',
			startTime: 'Start time',
			endTime: 'End time',
			startTimeFormat: 'Start time (HH:MM):',
			endTimeFormat: 'End time (HH:MM):',
			dayType: 'Day type:',
			timePeriod: 'Time period:',
			from: 'From:',
			to: 'To:',
			commentOptional: 'Comment (optional):',
			commentPlaceholder: 'E.g. "Vacation in Spain"',
			commentPlaceholders: {
				ferie: 'E.g. "Vacation in Spain"',
				egenmelding: 'E.g. "Headache"',
				sykemelding: 'E.g. "Flu"',
				velferdspermisjon: 'E.g. "Doctor appointment"',
				avspasering: 'E.g. "Early weekend"',
				helligdag: 'E.g. "May 1st"',
				kurs: 'E.g. "React course"',
				studie: 'E.g. "Exam preparation"',
				halfday: 'E.g. "Half day before vacation"',
				default: 'E.g. "Comment"',
			},
			durationHint: 'Number of hours (e.g. 3.5 for rest of day after leaving sick)',
			commentRequired: 'Comment required',
			commentTitle: 'Add comment',
			overtimeExplanation: 'You worked {hours} over the daily goal.',
			commentPrompt: 'Please explain why:',
			skip: 'Skip',
		},
		validation: {
			endAfterStart: 'End time must be after start time',
			invalidTime: 'Invalid time (use format HH:MM, 00-23:00-59)',
			invalidTimePeriod: 'Invalid time period',
			invalidDateRange: 'Invalid date range',
			overlappingEntry: 'This entry overlaps with an existing entry',
			endTimeNextDay: 'End time set to next day (before start time)',
			invalidDuration: 'Invalid duration',
			invalidTimeFormat: 'Invalid time format. Use HH:MM format.',
			startTimeRequired: 'Start time is required',
			invalidStartDateTime: 'Invalid start date/time',
			invalidEndDateTime: 'Invalid end date/time',
		},
		units: {
			day: 'day',
			days: 'days',
			hours: 'hours',
		},
		notifications: {
			added: 'Added',
			updated: 'Updated',
			deleted: 'Deleted',
			exported: 'Exported to CSV',
			saveError: 'Error saving data',
			addedWorkTime: 'Added {duration} hours of work time for {date}',
			errorAddingWorkTime: 'Could not add work time',
			noWorkEntriesFound: 'No work entries found for this date',
			entryUpdated: 'Entry updated',
			fileNotFound: 'File not found: {path}',
			sectionNotFound: 'Section not found',
			codeBlockNotFound: 'Code block not found in section',
			errorAddingSpecialDay: 'Could not add special day',
			openedExistingNote: 'Opened existing note: {filename}',
			createdNote: 'Created note: {filename}',
			errorCreatingNote: 'Error creating note: {error}',
			addedHours: 'Added {duration} hours for {date}',
			errorLoadingDashboard: 'Error loading dashboard: {error}',
			errorImporting: 'Error importing data',
			errorDeletingEntry: 'Error deleting entry',
			errorUpdatingEntry: 'Error updating entry',
		},
		confirm: {
			deleteEntry: 'Are you sure you want to delete this entry?',
			deleteEntryFor: 'Delete entry for',
			overnightShiftTitle: 'Overnight shift?',
			overnightShift: 'End time is before start time. Is this an overnight shift that crosses midnight?',
		},
		stats: {
			flextimeBalance: 'Flextime Balance',
			hours: 'Hours',
			avgPerDay: 'Avg/day',
			avgPerWeek: 'Avg/week',
			workIntensity: 'Workload',
			ofNormalWeek: 'of normal week',
			work: 'Work',
			weekendDaysWorked: 'Weekend days worked',
			flexTimeOff: 'Comp time',
			vacation: 'Vacation',
			welfareLeave: 'Welfare leave',
			selfReportedSick: 'Sick day (self-reported)',
			doctorSick: 'Certified sick leave',
			study: 'Study',
			course: 'Course',
			totalBalance: 'Total balance',
			weeklyHours: 'Weekly hours',
			monthlyHours: 'Monthly hours',
			yearlyHours: 'Yearly hours',
			target: 'Target',
			weekPrefix: 'W',
		},
		specialDays: {
			work: 'Work',
			vacation: 'Vacation',
			flexTimeOff: 'Comp time',
			selfReportedSick: 'Sick day (self-reported)',
			doctorSick: 'Certified sick leave',
			welfareLeave: 'Welfare leave',
			course: 'Course',
			study: 'Study',
			publicHoliday: 'Public holiday',
			other: 'Other',
		},
		annet: {
			title: 'Other',
			custom: 'Custom',
			fullDay: 'Full day',
			saveAsTemplate: 'Save as template',
			templateName: 'Template name',
			templateIcon: 'Icon',
			addTemplate: 'Add template',
			editTemplate: 'Edit template',
			deleteTemplate: 'Delete template',
			noTemplates: 'No templates defined',
			selectTemplate: 'Select template or custom',
			description: 'Description',
			fromTime: 'From',
			toTime: 'To',
			templateDescription: 'Templates for "Other" absence type. Behavior is automatically determined by full day or partial absence.',
			idDesc: 'Unique identifier (lowercase, no spaces). Used in file format.',
			labelField: 'Name',
			labelDesc: 'Display name in the interface',
			iconField: 'Icon',
			iconDesc: 'Emoji displayed with the template',
			idRequired: 'ID is required',
			labelRequired: 'Name is required',
			iconRequired: 'Icon is required',
			duplicateId: 'A template with this ID already exists',
			templatesSection: 'Other templates',
			templatesDesc: 'Templates for flexible absence types. Behavior is determined by full day or partial absence.',
			labelPlaceholder: 'Doctor',
			// Default template names
			doctor: 'Doctor',
			dentist: 'Dentist',
			funeral: 'Funeral',
		},
		common: {
			cancel: 'Cancel',
			save: 'Save',
			delete: 'Delete',
			edit: 'Edit',
			add: 'Add',
		},
		import: {
			title: 'Import data',
			description: 'Import time data from various formats. Supports Timekeep JSON, CSV and JSON arrays.',
			selectFile: 'Select file...',
			noFile: 'No file selected',
			orPasteData: 'Or paste data:',
			placeholder: 'Paste Timekeep JSON, CSV or JSON array here...\n\nExample CSV:\nDate;Start;End;Activity\n2024-11-25;08:00;16:00;work\n2024-11-26;09:00;17:00;work',
			format: 'Format:',
			autoDetect: 'Auto-detect',
			supportedFormats: 'Supported formats:',
			noEntries: 'No entries to import',
			entriesFound: 'entries found',
			imported: 'Imported',
			entries: 'entries',
			skippedDuplicates: 'skipped',
			duplicates: 'duplicates',
			andMore: 'and',
			more: 'more',
			errors: {
				invalidFormat: 'Invalid format',
				missingEntries: 'missing "entries" array',
				missingFields: 'Missing required fields',
				invalidStartTime: 'Invalid start time',
				invalidEndTime: 'Invalid end time',
				csvNeedsHeader: 'CSV must have at least a header row and a data row',
				jsonError: 'JSON error',
				unknownFormat: 'Could not recognize format. Supported formats: Timekeep JSON, CSV, JSON Array',
				couldNotFindDateColumn: 'Could not find date column. Expected: Date, Dato, Day',
				couldNotFindStartColumn: 'Could not find start time column. Expected: Start, From',
				tooFewColumns: 'Too few columns',
				missingDateOrTime: 'Missing date or start time',
				invalidDateFormat: 'Invalid date format. Use DD.MM.YYYY or YYYY-MM-DD',
				invalidTimeFormat: 'Invalid time. Use HH:MM',
				expectedJsonArray: 'Expected a JSON array',
				couldNotParseDateTime: 'Could not parse date/time',
				entry: 'Entry',
				row: 'Row',
				dateAutoCorrected: 'Invalid date {date} was auto-corrected to {corrected}',
			},
			warnings: 'Warnings',
			errors_label: 'Errors',
			tableHeaders: {
				date: 'Date',
				start: 'Start',
				end: 'End',
				type: 'Type',
			},
		},
		export: {
			csvTooltip: 'Export history to CSV file',
			noData: 'No data to export',
			success: 'Export completed',
			selectMonth: 'Export month',
			month: 'Month',
			allMonths: 'All months',
			date: 'Date',
			type: 'Type',
			start: 'Start',
			end: 'End',
			hours: 'Hours',
			flextime: 'Flextime',
			comment: 'Comment',
			monthlySummary: 'Monthly summary',
			totalHours: 'Total hours',
			totalFlextime: 'Total flextime',
			workDays: 'Work days',
			avgDaily: 'Average per day',
			typeBreakdown: 'Breakdown by type',
			typeHeader: 'Type',
			daysHeader: 'Days',
			hoursHeader: 'Hours',
		},
		settings: {
			language: 'Language',
			languageDesc: 'Choose interface language',
			showWeekNumbers: 'Show week numbers',
			showWeekNumbersDesc: 'Show week numbers in calendar and week card (ISO 8601 week numbers)',
			hideEmptyStats: 'Hide empty statistics',
			hideEmptyStatsDesc: 'Hide statistics with 0 hours/days',
			startingFlextimeBalance: 'Starting flextime balance',
			startingFlextimeBalanceDesc: 'Initial flextime balance to start with (use this if migrating from another system)',
			importData: 'Import data',
			importDataDesc: 'Import time data from various formats: Timekeep JSON, CSV (Norwegian/ISO date format), or JSON arrays',
			absenceTypesDesc: 'Create custom absence categories with specific flextime and statistics rules. Supports multi-day absences. For occasional one-off absences, use "Other templates" below.',
			addAbsenceType: 'Add absence type',
			overtimeComments: 'Overtime comments',
			enableOvertimeComments: 'Require comment on overtime',
			enableOvertimeCommentsDesc: 'Require comment when stopping a timer and daily work exceeds goal + threshold',
			overtimeCommentThreshold: 'Comment required (hours over goal)',
			overtimeCommentThresholdDesc: 'Require comment when daily total exceeds daily goal + this many hours (default: 0.5)',
			overtimeCommentEffectiveDate: 'Effective from date',
			overtimeCommentEffectiveDateDesc: 'Date from when comment requirement takes effect (older entries are not affected)',
		},
		compliance: {
			title: 'Work time limits',
			today: 'Today',
			thisWeek: 'This week',
			restPeriod: 'Rest period',
			limit: 'limit',
			approaching: 'approaching',
			exceeds: 'Exceeds',
			ok: 'OK',
			near: 'Near',
			over: 'Over',
		},
		timer: {
			runningTimers: 'Running timers',
			noActiveTimers: 'No active timers',
			started: 'Timer started: {name}',
			stopped: 'Timer stopped: {name} ({duration})',
			deleted: 'Timer deleted',
		},
		noteTypes: {
			daily: 'Daily Note',
			meeting: 'Meeting Note',
			project: 'Project Note',
			review: 'Weekly Review',
			reflection: 'Reflection Note',
		},
		info: {
			specialDayTypes: 'Absence types',
			workDaysGradient: 'Work days - color gradient',
			colorShowsFlextime: 'Color shows flextime relative to daily goal',
			calendarContextMenu: 'Calendar context menu',
			clickDayFor: 'Click on a day in the calendar for:',
			createDailyNote: 'Create daily note',
			editFlextimeManually: 'Edit flextime manually',
			registerSpecialDays: 'Register absences',
			flextimeBalanceZones: 'Flextime balance - zones',
			green: 'Green',
			yellow: 'Yellow',
			orange: 'Orange',
			red: 'Red',
			gray: 'Gray',
			to: 'to',
			weekNumberCompliance: 'Week number - status colors',
			reachedGoal: 'Reached goal',
			overGoal: 'Over goal',
			underGoal: 'Under goal',
			weekInProgress: 'Week in progress',
			clickWeekForDetails: 'Click on a week number for details.',
			publicHolidayDesc: 'Public holiday - does not affect flextime',
			halfDayDesc: 'Half work day ({hours}h) - reduces weekly goal by {reduction}h',
			withdrawFromFlextime: 'Deducted from flextime balance',
			countsAsFlextime: 'Counts as flextime above {hours}h',
			noFlextimeEffect: 'Does not affect flextime',
			workRegisteredOnSpecialDay: 'Work registered on {dayType}',
		},
	},
};

interface TranslationStrings {
	dates: {
		dayNamesShort: string[];
		dayNamesFull: string[];
	};
	ui: {
		today: string;
		thisWeek: string;
		week: string;
		calendar: string;
		statistics: string;
		history: string;
		information: string;
		flextimeBalance: string;
		hoursWorked: string;
		hoursLogged: string;
		hours: string;
		dayGoal: string;
		weekGoal: string;
		flextime: string;
		activeTimers: string;
		activeTimer: string;
		ongoing: string;
		total: string;
		year: string;
		month: string;
		all: string;
		date: string;
		type: string;
		start: string;
		end: string;
		duration: string;
		fullDay: string;
		comment: string;
		optional: string;
		days: string;
		goal: string;
		expected: string;
		difference: string;
		overWeekLimit: string;
		vsLastWeek: string;
		upcomingPlannedDays: string;
		dailyBalance: string;
		runningBalance: string;
		noRegistration: string;
		noDataForDay: string;
		addNewEntry: string;
		restPeriodWarning: string;
		restPeriod: string;
		minimum: string;
		multipleDays: string;
		startDate: string;
		endDate: string;
		weeklyViewComingSoon: string;
	};
	status: {
		ok: string;
		near: string;
		over: string;
		onTarget: string;
		overTarget: string;
		underTarget: string;
		inProgress: string;
		allLimitsOk: string;
		withinLimits: string;
		approachingLimits: string;
		systemStatus: string;
		clickForDetails: string;
		holidayNotLoaded: string;
		activeTimers: string;
		entriesChecked: string;
		loadedPlannedDays: string;
	};
	buttons: {
		cancel: string;
		save: string;
		delete: string;
		edit: string;
		close: string;
		add: string;
		done: string;
		start: string;
		stop: string;
		confirm: string;
		export: string;
		import: string;
		preview: string;
		list: string;
		heatmap: string;
		moveToMain: string;
		moveToSidebar: string;
	};
	menu: {
		logWork: string;
		editWork: string;
		registerSpecialDay: string;
		editPlannedDay: string;
		addEntry: string;
		deleteEntry: string;
		selectOption: string;
	};
	timeframes: {
		total: string;
		year: string;
		month: string;
	};
	modals: {
		logWorkTitle: string;
		editWorkTitle: string;
		registerSpecialDayTitle: string;
		addEntryTitle: string;
		deleteEntryTitle: string;
		startTime: string;
		endTime: string;
		startTimeFormat: string;
		endTimeFormat: string;
		dayType: string;
		timePeriod: string;
		from: string;
		to: string;
		commentOptional: string;
		commentPlaceholder: string;
		commentPlaceholders: {
			ferie: string;
			egenmelding: string;
			sykemelding: string;
			velferdspermisjon: string;
			avspasering: string;
			helligdag: string;
			kurs: string;
			studie: string;
			halfday: string;
			default: string;
		};
		durationHint: string;
		commentRequired: string;
		commentTitle: string;
		overtimeExplanation: string;
		commentPrompt: string;
		skip: string;
	};
	validation: {
		endAfterStart: string;
		invalidTime: string;
		invalidTimePeriod: string;
		invalidDateRange: string;
		overlappingEntry: string;
		endTimeNextDay: string;
		invalidDuration: string;
		invalidTimeFormat: string;
		startTimeRequired: string;
		invalidStartDateTime: string;
		invalidEndDateTime: string;
	};
	units: {
		day: string;
		days: string;
		hours: string;
	};
	notifications: {
		added: string;
		updated: string;
		deleted: string;
		exported: string;
		saveError: string;
		addedWorkTime: string;
		errorAddingWorkTime: string;
		noWorkEntriesFound: string;
		entryUpdated: string;
		fileNotFound: string;
		sectionNotFound: string;
		codeBlockNotFound: string;
		errorAddingSpecialDay: string;
		openedExistingNote: string;
		createdNote: string;
		errorCreatingNote: string;
		addedHours: string;
		errorLoadingDashboard: string;
		errorImporting: string;
		errorDeletingEntry: string;
		errorUpdatingEntry: string;
	};
	confirm: {
		deleteEntry: string;
		deleteEntryFor: string;
		overnightShiftTitle: string;
		overnightShift: string;
	};
	stats: {
		flextimeBalance: string;
		hours: string;
		avgPerDay: string;
		avgPerWeek: string;
		workIntensity: string;
		ofNormalWeek: string;
		work: string;
		weekendDaysWorked: string;
		flexTimeOff: string;
		vacation: string;
		welfareLeave: string;
		selfReportedSick: string;
		doctorSick: string;
		study: string;
		course: string;
		totalBalance: string;
		weeklyHours: string;
		monthlyHours: string;
		yearlyHours: string;
		target: string;
		weekPrefix: string;
	};
	specialDays: {
		work: string;
		vacation: string;
		flexTimeOff: string;
		selfReportedSick: string;
		doctorSick: string;
		welfareLeave: string;
		course: string;
		study: string;
		publicHoliday: string;
		other: string;
	};
	annet: {
		title: string;
		custom: string;
		fullDay: string;
		saveAsTemplate: string;
		templateName: string;
		templateIcon: string;
		addTemplate: string;
		editTemplate: string;
		deleteTemplate: string;
		noTemplates: string;
		selectTemplate: string;
		description: string;
		fromTime: string;
		toTime: string;
		templateDescription: string;
		idDesc: string;
		labelField: string;
		labelDesc: string;
		iconField: string;
		iconDesc: string;
		idRequired: string;
		labelRequired: string;
		iconRequired: string;
		duplicateId: string;
		templatesSection: string;
		templatesDesc: string;
		labelPlaceholder: string;
		// Default template names
		doctor: string;
		dentist: string;
		funeral: string;
	};
	common: {
		cancel: string;
		save: string;
		delete: string;
		edit: string;
		add: string;
	};
	import: {
		title: string;
		description: string;
		selectFile: string;
		noFile: string;
		orPasteData: string;
		placeholder: string;
		format: string;
		autoDetect: string;
		supportedFormats: string;
		noEntries: string;
		entriesFound: string;
		imported: string;
		entries: string;
		skippedDuplicates: string;
		duplicates: string;
		andMore: string;
		more: string;
		errors: {
			invalidFormat: string;
			missingEntries: string;
			missingFields: string;
			invalidStartTime: string;
			invalidEndTime: string;
			csvNeedsHeader: string;
			jsonError: string;
			unknownFormat: string;
			couldNotFindDateColumn: string;
			couldNotFindStartColumn: string;
			tooFewColumns: string;
			missingDateOrTime: string;
			invalidDateFormat: string;
			invalidTimeFormat: string;
			expectedJsonArray: string;
			couldNotParseDateTime: string;
			entry: string;
			row: string;
			dateAutoCorrected: string;
		};
		warnings: string;
		errors_label: string;
		tableHeaders: {
			date: string;
			start: string;
			end: string;
			type: string;
		};
	};
	export: {
		csvTooltip: string;
		noData: string;
		success: string;
		selectMonth: string;
		month: string;
		allMonths: string;
		date: string;
		type: string;
		start: string;
		end: string;
		hours: string;
		flextime: string;
		comment: string;
		monthlySummary: string;
		totalHours: string;
		totalFlextime: string;
		workDays: string;
		avgDaily: string;
		typeBreakdown: string;
		typeHeader: string;
		daysHeader: string;
		hoursHeader: string;
	};
	settings: {
		language: string;
		languageDesc: string;
		showWeekNumbers: string;
		showWeekNumbersDesc: string;
		hideEmptyStats: string;
		hideEmptyStatsDesc: string;
		startingFlextimeBalance: string;
		startingFlextimeBalanceDesc: string;
		importData: string;
		importDataDesc: string;
		absenceTypesDesc: string;
		addAbsenceType: string;
		overtimeComments: string;
		enableOvertimeComments: string;
		enableOvertimeCommentsDesc: string;
		overtimeCommentThreshold: string;
		overtimeCommentThresholdDesc: string;
		overtimeCommentEffectiveDate: string;
		overtimeCommentEffectiveDateDesc: string;
	};
	compliance: {
		title: string;
		today: string;
		thisWeek: string;
		restPeriod: string;
		limit: string;
		approaching: string;
		exceeds: string;
		ok: string;
		near: string;
		over: string;
	};
	timer: {
		runningTimers: string;
		noActiveTimers: string;
		started: string;
		stopped: string;
		deleted: string;
	};
	noteTypes: {
		daily: string;
		meeting: string;
		project: string;
		review: string;
		reflection: string;
	};
	info: {
		specialDayTypes: string;
		workDaysGradient: string;
		colorShowsFlextime: string;
		calendarContextMenu: string;
		clickDayFor: string;
		createDailyNote: string;
		editFlextimeManually: string;
		registerSpecialDays: string;
		flextimeBalanceZones: string;
		green: string;
		yellow: string;
		orange: string;
		red: string;
		gray: string;
		to: string;
		weekNumberCompliance: string;
		reachedGoal: string;
		overGoal: string;
		underGoal: string;
		weekInProgress: string;
		clickWeekForDetails: string;
		publicHolidayDesc: string;
		halfDayDesc: string;
		withdrawFromFlextime: string;
		countsAsFlextime: string;
		noFlextimeEffect: string;
		workRegisteredOnSpecialDay: string;
	};
}
