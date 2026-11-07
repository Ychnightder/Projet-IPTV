import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import channelRoutes from './routes/channel.routes.js';
import { loadChannelsMapping } from './services/freebox.service.js';
import { refreshAllEpg } from './services/epg.service.js';

const startEpgWorker = async () => {
	// 1. Précharge la map { "france 2" => "uuid-webtv-612" } (M3U -> UUID Freebox)
	await loadChannelsMapping();

	// 2. Premier téléchargement de l'EPG (toutes les chaînes en 2 requêtes)
	await refreshAllEpg();

	// 3. Mise à jour toutes les 5 minutes (300 000 ms)
	setInterval(refreshAllEpg, 300000);
};




const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/channels', channelRoutes);



app.listen(PORT, () => {
	console.log(`🚀 API Onde démarrée sur http://localhost:${PORT}`);
});

startEpgWorker();