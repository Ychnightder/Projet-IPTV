import express, { type Request, type Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import parser from 'iptv-playlist-parser';

const app = express();
const PORT = process.env.PORT || 3001;
const FREEBOX_M3U_URL = 'http://mafreebox.freebox.fr/freeboxtv/playlist.m3u';

app.use(cors());
app.use(express.json());

interface Channel {
	id: string;
	number: number | null;
	name: string;
	quality?: string;
	group?: string;
	url: string;
}

app.get('/api/channels', async (req: Request, res: Response) => {
	try {
		const response = await axios.get(FREEBOX_M3U_URL, { timeout: 5000 });
		const playlistRaw = response.data;

		const parseFn = typeof parser === 'function' ? parser : (parser as any).parse;
		const parsedPlaylist = parseFn(playlistRaw);

		const channels: Channel[] = parsedPlaylist.items.map((ch: any, index: number) => {
			const fullName = ch.name || '';

			// Extraction du numéro et du nom (ex: "1 - France 2 HD" -> number: 1, name: "France 2 HD")
			const matchNumber = fullName.match(/^(\d+)\s*-\s*(.+)$/);
			const channelNumber = matchNumber ? parseInt(matchNumber[1], 10) : null;
			let cleanName = matchNumber ? matchNumber[2].trim() : fullName.trim();

			// Détection de la qualité / version du flux
			let quality = 'SD';
			if (cleanName.includes('HD')) quality = 'HD';
			else if (cleanName.includes('bas débit') || cleanName.includes('Bas débit')) quality = 'Bas débit';

			return {
				id: `channel-${channelNumber ?? index}-${index}`,
				number: channelNumber,
				name: cleanName,
				quality,
				group: ch.group?.title || 'Freebox TV',
				url: ch.url,
			};
		});

		res.json({
			success: true,
			count: channels.length,
			channels,
		});
	} catch (error: any) {
		console.error('Erreur lors de la récupération de la playlist :', error.message);
		res.status(500).json({
			success: false,
			error: 'Impossible de récupérer la playlist Freebox. Vérifiez que vous êtes connecté au Wi-Fi local de la Freebox.',
		});
	}
});

app.listen(PORT, () => {
	console.log(`🚀 Serveur Backend Freebox TV démarré sur http://localhost:${PORT}`);
});
