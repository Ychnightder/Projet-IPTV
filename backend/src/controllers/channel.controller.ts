import type { Request, Response } from 'express';
import type { ChannelInfo } from '../models/Channel.model.js';
import { loadFreeboxChannels, type FreeboxStream } from '../services/freebox.service.js';
import { getCachedEPG } from '../services/epg.service.js';

// Les numéros 1 à 27 correspondent à la TNT, le reste au bouquet Freebox TV
const TNT_MAX_NUMBER = 27;

// Flux préféré : "auto" (qualité adaptée par la Freebox), sinon HD, SD, puis bas débit
const QUALITY_ORDER = ['auto', 'hd', 'sd', 'ld'];
const pickStream = (streams: FreeboxStream[]): FreeboxStream | undefined =>
	[...streams].sort((a, b) => rank(a.quality) - rank(b.quality))[0];
const rank = (quality: string) => {
	const i = QUALITY_ORDER.indexOf(quality);
	return i === -1 ? QUALITY_ORDER.length : i;
};

export const getChannels = async (req: Request, res: Response) => {
	try {
		const freeboxChannels = await loadFreeboxChannels();

		const channels: ChannelInfo[] = [];
		for (const ch of freeboxChannels) {
			const stream = pickStream(ch.streams);
			if (!stream) continue; // Chaîne sans flux diffusable : rien à lire

			const { currentProgram, nextProgram } = getCachedEPG(ch.uuid);
			channels.push({
				id: ch.uuid,
				number: ch.number,
				name: ch.name,
				logoUrl: ch.logoUrl,
				group: ch.number <= TNT_MAX_NUMBER ? 'TNT' : 'Freebox TV',
				currentProgram,
				nextProgram,
				streams: { rtsp: stream.rtsp },
			});
		}

		res.json({ success: true, count: channels.length, channels });
	} catch (error: any) {
		console.error('Erreur lors de la récupération des chaînes :', error.message);
		res.status(500).json({
			success: false,
			error: 'Impossible de récupérer les chaînes Freebox. Vérifiez que vous êtes connecté au réseau local de la Freebox.',
		});
	}
};
