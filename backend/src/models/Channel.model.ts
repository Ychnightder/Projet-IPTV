

export interface Program {
	title: string; // ex: "Les Alpes, à l'état sauvage"
	subtitle?: string; // ex: "Une échappée au sommet..."
	category: string; // ex: "Documentaire", "Sport"
	startTime: string; // ex: "20:50" (ou timestamp ISO)
	endTime: string; // ex: "21:45"
	progressPercent: number; // Pour la barre bleue (ex: 45)
	imageUrl: string;
}


export interface ChannelInfo {
	id: string; // ex: "ch_7"
	number: number; // ex: 7
	name: string; // ex: "Arte"
	logoUrl: string; // URL vers le logo propre de la chaîne
	group: string; // ex: "TNT"
	currentProgram: Program | null;
	nextProgram?: Program | null;
	streams: {
		webrtc?: string;
		hls?: string;
		rtsp: string;
	};
}

