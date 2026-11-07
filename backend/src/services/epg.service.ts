import type { Program } from '../models/Channel.model.js';
import axios from 'axios';

const FREEBOX_BASE_URL = 'http://mafreebox.freebox.fr';

// Programme brut tel que renvoyé par l'API EPG de la Freebox
interface FreeboxProgram {
	title: string;
	sub_title?: string;
	category_name?: string;
	date: number; // timestamp UNIX (secondes) de début
	duration: number; // en secondes
	picture?: string;
	picture_big?: string;
}

// UUID de chaîne => programmes triés par heure de début
const epgCache = new Map<string, FreeboxProgram[]>();

// Calcule l'avancement de l'émission pour la barre bleue
const calculateProgress = (startTs: number, durationSec: number): number => {
	const nowSec = Math.floor(Date.now() / 1000);
	const endTs = startTs + durationSec;

	if (nowSec < startTs) return 0;
	if (nowSec > endTs) return 100;

	return Math.round(((nowSec - startTs) / durationSec) * 100);
};

// Convertit un timestamp UNIX (secondes) en format "HH:mm"
const formatTime = (timestamp: number): string => {
	const date = new Date(timestamp * 1000);
	return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const toProgram = (p: FreeboxProgram, progressPercent: number): Program => {
	const picture = p.picture_big || p.picture;
	return {
		title: p.title,
		...(p.sub_title ? { subtitle: p.sub_title } : {}),
		category: p.category_name ?? '',
		startTime: formatTime(p.date),
		endTime: formatTime(p.date + p.duration),
		progressPercent,
		imageUrl: picture ? `${FREEBOX_BASE_URL}${picture}` : '',
	};
};

// Récupère les programmes de TOUTES les chaînes pour le créneau contenant `timestamp`.
// Un seul appel couvre toutes les chaînes : indispensable car la Freebox renvoie
// HTTP 429 au-delà de ~80 requêtes rapprochées (impossible d'interroger chaque chaîne).
const fetchEpgSlot = async (timestamp: number): Promise<Record<string, Record<string, FreeboxProgram>>> => {
	const { data } = await axios.get(`${FREEBOX_BASE_URL}/api/latest/tv/epg/by_time/${timestamp}/`, { timeout: 15000 });
	if (!data.success || !data.result) throw new Error('Réponse EPG invalide');
	return data.result;
};

let refreshInProgress = false;

export const refreshAllEpg = async () => {
	if (refreshInProgress) return;
	refreshInProgress = true;
	console.log('🔄 [EPG] Début de la mise à jour...');

	try {
		const now = Math.floor(Date.now() / 1000);
		// Créneau actuel + créneau suivant (1 h plus tard) pour avoir aussi le programme suivant
		const slots = await Promise.all([fetchEpgSlot(now), fetchEpgSlot(now + 3600)]);

		const merged = new Map<string, Map<number, FreeboxProgram>>();
		for (const slot of slots) {
			for (const [uuid, programs] of Object.entries(slot)) {
				const byDate = merged.get(uuid) ?? new Map<number, FreeboxProgram>();
				for (const p of Object.values(programs)) byDate.set(p.date, p); // dédoublonnage par heure de début
				merged.set(uuid, byDate);
			}
		}

		for (const [uuid, byDate] of merged) {
			epgCache.set(uuid, [...byDate.values()].sort((a, b) => a.date - b.date));
		}
		console.log(`✅ [EPG] Mise à jour terminée : ${merged.size} chaînes.`);
	} catch (error: any) {
		// On garde l'ancien cache plutôt que de l'effacer
		console.error(`❌ [EPG] Échec de la mise à jour : ${error.message}`);
	} finally {
		refreshInProgress = false;
	}
};

// Lecture instantanée pour l'API (programme en cours / suivant calculés à l'instant T)
export const getCachedEPG = (channelUuid: string): { currentProgram: Program | null; nextProgram: Program | null } => {
	const programs = epgCache.get(channelUuid);
	if (!programs) return { currentProgram: null, nextProgram: null };

	const nowSec = Math.floor(Date.now() / 1000);
	const i = programs.findIndex(p => p.date <= nowSec && nowSec < p.date + p.duration);
	if (i === -1) return { currentProgram: null, nextProgram: null };

	const current = programs[i]!;
	const next = programs[i + 1];
	return {
		currentProgram: toProgram(current, calculateProgress(current.date, current.duration)),
		nextProgram: next ? toProgram(next, 0) : null,
	};
};
