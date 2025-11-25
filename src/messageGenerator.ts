import { Utils } from './utils';

export class MessageGenerator {
	static getDailyMessage(
		hours: number,
		goal: number,
		specials: string[],
		isWeekendDay: boolean,
		avgDaily: number,
		context: any,
		consecutiveFlextimeWarningDays: number
	): string {
		if (isWeekendDay) {
			const weekday = new Date().getDay();
			if (weekday === 6) {
				if (hours === 0)
					return Utils.randMsg([
						"Lørdag – ingen logg ennå, perfekt for fri 🛌",
						"Fri-modus: nyt lørdagen! 🌤️",
					]);
				if (hours < 2)
					return Utils.randMsg([
						"Litt helgeinnsats – godt gjort!",
						"Rolig lørdag med litt arbeid – fin balanse ⚖️",
					]);
				return Utils.randMsg([
					"🔥 Jobbing på lørdagen – imponerende dedikasjon!",
					"Lørdag med driv – pass på å hvile litt også 💆",
				]);
			}
			if (weekday === 0) {
				if (hours === 0)
					return Utils.randMsg([
						"Søndag – helt fri, slik det skal være ☕",
						"Søndag – lade opp til en ny uke 🌿",
					]);
				return Utils.randMsg([
					"Litt søndagsjobbing – godt for samvittigheten 💪",
					"Rolig søndag med litt innsats – flott balansert 🌞",
				]);
			}
		}

		if (specials.length > 0) {
			const s = specials.join(", ").toLowerCase();
			const now = new Date();
			const currentHour = now.getHours();

			if (s.includes("ferie")) {
				if (currentHour < 12)
					return Utils.randMsg([
						"☀️ Feriemorgen – sov lenge og slapp av!",
						"🏖️ Ferie – ingen tidlig start i dag!",
					]);
				if (currentHour < 18)
					return Utils.randMsg([
						"☀️ Nyt ferien – du har fortjent det!",
						"🌴 Feriedag – gjør noe hyggelig!",
					]);
				return Utils.randMsg([
					"🌙 Feriekveld – kos deg!",
					"✨ Ferieflyt – nyt kvelden!",
				]);
			}

			if (s.includes("velferdspermisjon")) {
				if (currentHour < 12)
					return Utils.randMsg([
						"🏥 Velferdspermisjon – ta vare på deg selv",
						"💚 Viktig dag for velvære – bruk tiden godt",
					]);
				if (currentHour < 18)
					return Utils.randMsg([
						"🏥 Velferdspermisjon – håper alt går bra",
						"💚 Ta den tiden du trenger i dag",
					]);
				return Utils.randMsg([
					"🌙 Velferdspermisjon – hvil og ta vare på deg",
					"✨ Viktig å prioritere eget velvære",
				]);
			}

			if (s.includes("avspasering")) {
				if (currentHour < 12)
					return Utils.randMsg([
						"🛌 Avspasering – perfekt dag for litt ekstra søvn!",
						"😴 Fri dag – du har fortjent denne hvilen!",
					]);
				if (currentHour < 18)
					return Utils.randMsg([
						"🛌 Godt med litt fri – du har fortjent det!",
						"💆 Avspasering – bruk dagen på noe du liker!",
					]);
				return Utils.randMsg([
					"🌙 Avspasering – slapp av resten av kvelden!",
					"✨ Fin fridag – håper du har hatt en god dag!",
				]);
			}

			if (s.includes("egenmelding")) {
				if (hours === 0)
					return Utils.randMsg([
						"🤒 Egenmelding – hvil og bli frisk!",
						"💊 Ta det rolig – kroppen trenger hvile!",
					]);
				if (hours < 2)
					return Utils.randMsg([
						"🤒 Egenmelding, men du har vært litt aktiv – ikke overdriv!",
						"💊 Håper du føler deg bedre – husk å hvile!",
					]);
				return Utils.randMsg([
					"🤒 Egenmelding med mye aktivitet – pass på å ikke presse deg!",
					"💊 Ta vare på deg selv – hvil er viktig!",
				]);
			}

			if (s.includes("studie") || s.includes("kurs")) {
				if (hours === 0)
					return Utils.randMsg([
						"📖 Studiedag – tid for å lære noe nytt!",
						"📚 Studietid – lykke til med læringen!",
					]);
				if (hours < 3)
					return Utils.randMsg([
						"📖 God start på studiedagen – fortsett sånn!",
						"📚 Fin studieflyt så langt!",
					]);
				if (hours < 5)
					return Utils.randMsg([
						"📖 Solid studieinnsats – godt jobbet!",
						"📚 Du lærer mye i dag – flott fremgang!",
					]);
				return Utils.randMsg([
					"📖 Imponerende studieinnsats i dag – husk pauser!",
					"📚 Dedikert studiedag – fantastisk innsats!",
				]);
			}
		}

		const diff = hours - goal;
		const now = new Date();
		const currentHour = now.getHours();

		if (context.consecutiveFlextimeDays >= consecutiveFlextimeWarningDays) {
			return `⚠️ ${context.consecutiveFlextimeDays} dager på rad med fleksitid – husk å ta vare på deg selv!`;
		}

		if (context.sameDayAvg > 0) {
			const weekdayName = [
				"søndag",
				"mandag",
				"tirsdag",
				"onsdag",
				"torsdag",
				"fredag",
				"lørdag",
			][now.getDay()];
			if (hours > context.sameDayAvg + 1) {
				return `Mer aktiv enn vanlig for en ${weekdayName} 💪 (snitt: ${context.sameDayAvg.toFixed(1)}t)`;
			}
			if (hours < context.sameDayAvg - 1 && hours > 2) {
				return `Roligere ${weekdayName} enn vanlig (snitt: ${context.sameDayAvg.toFixed(1)}t) 🌿`;
			}
		}

		if (currentHour < 12 && hours === 0) {
			return "God morgen! Dagen starter rolig ☕";
		}

		if (currentHour >= 15 && diff < -2) {
			const hoursNeeded = (goal - hours).toFixed(1);
			return `${hoursNeeded}t igjen for å nå dagsmål – fortsatt mulig! 🎯`;
		}

		if (currentHour >= 16 && hours >= goal) {
			return "Dagsmål nådd! 🎉 Ta en pause eller jobb videre mot fleksitid.";
		}

		if (avgDaily > 0) {
			if (hours > avgDaily + 1)
				return "Du ligger over snittet for de siste dagene 👍";
			if (hours < avgDaily - 1)
				return "Litt roligere enn vanlig – fullt fortjent 💆";
		}

		if (hours === 0) return "Rolig start – kanskje planlegg dagen?";
		if (diff < -1) return "Dagen har så vidt begynt – god tid til å nå målet.";
		if (diff >= -1 && diff <= 1) return "Du ligger helt perfekt an i dag 👌";
		if (diff > 1 && diff <= 2) return "Sterk innsats – nærmer deg fleksitid 💪";
		if (diff > 2)
			return "🚀 Ekstra innsats i dag! Husk å ta deg tid til en pause.";
		return "";
	}

	static getWeeklyMessage(
		hours: number,
		goal: number,
		specials: string[],
		today: Date,
		context: any,
		weekendWorkHours: number = 0
	): string {
		const ferie = specials.some((s) => s.toLowerCase().includes("ferie"));
		const velferdspermisjon = specials.some((s) => s.toLowerCase().includes("velferdspermisjon"));
		const avsp = specials.some((s) => s.toLowerCase().includes("avspasering"));
		const studie = specials.some((s) => s.toLowerCase().includes("studie") || s.toLowerCase().includes("kurs"));

		if (ferie) return "🏖️ Ukas rytme er preget av ferie – nyt det! ";
		if (velferdspermisjon) return "🏥 Velferdspermisjon denne uka – ta vare på deg selv! ";
		if (avsp) return "😌 Litt fri denne uka – god balanse. ";
		if (studie) return "📚 Denne uka har du prioritert studier – flott! ";

		const weekday = today.getDay();
		const isWeekendDay = weekday === 6 || weekday === 0;
		const workdaysPassed = Math.min(Math.max(weekday - 1, 0), 5);
		const totalWorkdays = 5;
		const expectedProgress = (workdaysPassed / totalWorkdays) * goal;
		const diffFromExpected = hours - expectedProgress;

		if (context.lastWeekHours > 0) {
			const diff = hours - context.lastWeekHours;
			if (Math.abs(diff) > 5 && workdaysPassed >= 3) {
				if (diff > 0) {
					return `Mer travelt enn forrige uke (+${diff.toFixed(1)}t) 📈 `;
				} else {
					return `Roligere enn forrige uke (${diff.toFixed(1)}t) 📉 `;
				}
			}
		}

		if (isWeekendDay) {
			if (weekendWorkHours === 0)
				return "🌙 Helg! Godt jobbet denne uka – nyt fritiden. ";
			if (weekendWorkHours < 2)
				return "📅 Litt helgeinnsats – ikke glem pauser og påfyll! ";
			if (hours >= goal)
				return "🔥 Jobbing i helga – imponerende dedikasjon, men pass på å hvile! ";
			return "🌞 En rolig helg etter en balansert uke. ";
		}

		if (workdaysPassed <= 1) {
			if (hours < expectedProgress)
				return "Uka er i gang – ta det i eget tempo 💪 ";
			if (diffFromExpected >= 1) return "Sterk start på uka! 🌟 ";
			return "Fin rytme så langt – fortsett sånn. ";
		}

		if (workdaysPassed >= 2 && workdaysPassed <= 3) {
			if (diffFromExpected < -2)
				return "Du ligger litt bak skjema – men fortsatt god tid til å hente inn 🌿 ";
			if (diffFromExpected >= -2 && diffFromExpected <= 2)
				return "Jevn og fin flyt gjennom uka 👌 ";
			if (diffFromExpected > 2)
				return "Travle dager – men du håndterer det godt 💪 ";
		}

		if (weekday === 5) {
			if (hours < goal * 0.8)
				return "Fredag – snart helg! Du er nesten i mål 🎯 ";
			if (hours >= goal && hours <= goal + 3)
				return "👍 Uka i boks – god innsats! ";
			if (hours > goal + 3)
				return "🔥 Ekstra innsats denne uka – husk å logge fleksitid! ";
			return "Fredagsflyt 🌤️ ";
		}

		const diff = hours - goal;
		if (diff < -3)
			return "Du ligger litt bak skjema – ingen fare, uka er ung! ";
		if (diff >= -3 && diff <= 2) return "Fin flyt denne uka 🌿 ";
		if (diff > 2 && diff <= 5) return "Travelt, men godt jobbet! ";
		if (diff > 5) return "🔥 Ekstra innsats denne uka – pass på hvilen! ";

		return "";
	}
}
