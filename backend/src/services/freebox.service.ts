import axios from 'axios';
import parser from 'iptv-playlist-parser';

const FREEBOX_BASE_URL = 'http://mafreebox.freebox.fr';
const FREEBOX_M3U_URL = process.env.FREEBOX_M3U_URL || `${FREEBOX_BASE_URL}/freeboxtv/playlist.m3u`;
let channelsUuidMap: Map<string, string> | null = null;

export const fetchAndParsePlaylist = async () => {
	const response = await axios.get(FREEBOX_M3U_URL, { timeout: 5000 });
	const parseFn = typeof parser === 'function' ? parser : (parser as any).parse;
	return parseFn(response.data);
};


// Fonction de nettoyage pour pouvoir comparer "2 - France 2 (auto)" du M3U avec "France 2" de l'API
export const normalizeChannelName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/^\d+\s*-\s*/, '') // Enlève le numéro au début (ex: "2 - ")
    .replace(/\(auto\)/g, '')   // Enlève la mention (auto)
    .replace(/\(bas débit\)/g, '') // Enlève la mention bas débit
    .replace(/hd/g, '')         // Enlève la mention HD
    .trim();
};


export interface FreeboxStream {
  quality: string; // "auto" | "hd" | "sd" | "ld"
  rtsp: string;
  hls?: string;
}

// Chaîne du bouquet Freebox TV, enrichie avec son nom et son logo
export interface FreeboxChannel {
  uuid: string; // ex: "uuid-webtv-201"
  number: number;
  subNumber: number;
  name: string;
  logoUrl: string;
  streams: FreeboxStream[]; // vide si la chaîne n'est pas diffusable
}

let freeboxChannels: FreeboxChannel[] | null = null;

// Télécharge et met en cache la liste des chaînes disponibles sur l'abonnement
export const loadFreeboxChannels = async (): Promise<FreeboxChannel[]> => {
  if (freeboxChannels) return freeboxChannels; // Retourne le cache s'il existe déjà

  // Le bouquet donne les UUID, numéros et flux (sans les noms), /tv/channels/ donne les noms indexés par UUID
  const [bouquetRes, channelsRes] = await Promise.all([
    axios.get(`${FREEBOX_BASE_URL}/api/latest/tv/bouquets/freeboxtv/channels/`, { timeout: 5000 }),
    axios.get(`${FREEBOX_BASE_URL}/api/latest/tv/channels/`, { timeout: 5000 }),
  ]);
  if (!bouquetRes.data.success || !channelsRes.data.success) throw new Error('Réponse Freebox invalide');

  const bouquet: { uuid: string; number: number; sub_number?: number; available?: boolean; streams?: FreeboxStream[] }[] =
    bouquetRes.data.result ?? [];
  const channelsByUuid: Record<string, { name?: string; logo_url?: string }> = channelsRes.data.result ?? {};

  const channels: FreeboxChannel[] = [];
  for (const entry of bouquet) {
    if (!entry.available) continue; // Chaînes non disponibles sur cet abonnement
    const info = channelsByUuid[entry.uuid];
    if (!info?.name) continue;
    channels.push({
      uuid: entry.uuid,
      number: entry.number,
      subNumber: entry.sub_number ?? 0,
      name: info.name,
      logoUrl: info.logo_url ? `${FREEBOX_BASE_URL}${info.logo_url}` : '',
      streams: entry.streams ?? [],
    });
  }
  channels.sort((a, b) => a.number - b.number || a.subNumber - b.subNumber);

  freeboxChannels = channels; // Mis en cache uniquement en cas de succès
  return channels;
};

// Construit la map { nom normalisé => UUID } (ex: { "france 2" => "uuid-webtv-201" })
export const loadChannelsMapping = async (): Promise<Map<string, string>> => {
  if (channelsUuidMap) return channelsUuidMap;

  try {
    const channels = await loadFreeboxChannels();
    channelsUuidMap = new Map(channels.map(ch => [normalizeChannelName(ch.name), ch.uuid]));
    console.log(`✅ Mapping Freebox chargé : ${channelsUuidMap.size} chaînes indexées.`);
    return channelsUuidMap;
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des UUID Freebox :", error.message);
    return new Map<string, string>();
  }
};

// Fonction utilitaire pour récupérer l'UUID d'une chaîne à partir de son nom M3U
export const getUuidForChannel = async (m3uName: string): Promise<string | null> => {
  const map = await loadChannelsMapping();
  const cleanName = normalizeChannelName(m3uName);
  return map.get(cleanName) || null;
}
