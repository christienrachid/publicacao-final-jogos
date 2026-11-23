// CONTRATO compartilhado do simulador de voo (dono: maestro).
// Não altere sem combinar: voo (Codex), câmeras/cabine/HUD (Gemini) e main.ts dependem dele.
//
// Coordenadas: Y para cima; norte = -Z; leste = +X; frente do avião = -Z local.
// Ângulos em graus. Distâncias em metros. Velocidades em m/s.

import type { AppBase, Entity } from 'playcanvas';
import type { AirplaneModel } from './airplane';
import type { World } from './world';
import { terrainHeight } from './world-data';

/**
 * O que o jogador controla agora: a pé ou um veículo (Etapa 4, mundo aberto de veículos).
 * Escrito SÓ pelo gerenciador de veículos (vehicles.ts); câmeras, HUD, áudio e cabine leem.
 */
export type VehicleKind = 'foot' | 'car' | 'tuned' | 'a29' | 'heli';

/** Veículo existente no mundo (estacionado ou em uso). `variant` escolhe o modelo do carro. */
export interface VehicleSpawn {
  id: string;
  kind: Exclude<VehicleKind, 'foot'>;
  x: number;
  y: number;
  z: number;
  heading: number;
  variant?: number;
}

export type CameraMode = 'chase' | 'top' | 'cockpit';
export const CAMERA_ORDER: CameraMode[] = ['chase', 'top', 'cockpit'];
export const CAMERA_LABEL: Record<CameraMode, string> = {
  chase: 'ATRÁS',
  top: 'DE CIMA',
  cockpit: 'CABINE',
};

/** Estado do voo: escrito SÓ pelo FlightController; lido por câmeras, cabine e HUD. */
export interface FlightState {
  /** Posição do avião no mundo (centro do modelo). */
  x: number;
  y: number;
  z: number;
  /** Arfagem: + nariz para cima. */
  pitch: number;
  /** Rolagem: + asa direita para baixo (curva para a direita). */
  roll: number;
  /** Rumo da bússola 0..360: 0 = norte (-Z), 90 = leste (+X). */
  heading: number;
  /** Velocidade no ar (m/s). */
  speed: number;
  /** Velocidade vertical (m/s, + subindo). */
  verticalSpeed: number;
  /** Altitude acima do nível do mar (= y). */
  altitude: number;
  /** Altura acima do obstáculo logo abaixo (terreno, prédio ou mar). */
  heightAboveGround: number;
  /** Acelerador 0..1. */
  throttle: number;
  /** true quando a velocidade está abaixo do mínimo para sustentação. */
  stall: boolean;
  /** true entre a batida e o respawn (≈2 s). */
  crashed: boolean;
  /** Câmera atual (escrita só pelo CameraRig). */
  camera: CameraMode;
  /** Modo de controle: teclado direto ou mira pelo mouse (tecla M alterna; escrito pelo CameraRig). */
  controlMode: 'keyboard' | 'mouse';
  /** Direção desejada no mundo (vetor unitário), escrita pelo CameraRig no modo mouse; o voo pilota até ela. */
  aimX: number;
  aimY: number;
  aimZ: number;
  /** O que o jogador controla agora (o FlightState descreve esse corpo: pessoa ou veículo). */
  vehicle: VehicleKind;
  /** Veículo parado ao alcance para entrar com E (null se nenhum); o HUD mostra o aviso. */
  nearbyVehicleId: string | null;
  nearbyVehicleKind: Exclude<VehicleKind, 'foot'> | null;
}

export function createFlightState(): FlightState {
  return {
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    roll: 0,
    heading: 0,
    speed: 0,
    verticalSpeed: 0,
    altitude: 0,
    heightAboveGround: 0,
    throttle: 0.6,
    stall: false,
    crashed: false,
    camera: 'chase',
    controlMode: 'mouse',
    aimX: 0,
    aimY: 0,
    aimZ: -1,
    vehicle: 'car',
    nearbyVehicleId: null,
    nearbyVehicleKind: null,
  };
}

/** Ponto de nascimento no ar (reinício sem veículo): ao sul de Juiz de Fora, voando para o norte sobre o relevo. */
const spawnZ = (() => { for (let z = 1300; z <= 2900; z += 50) if (terrainHeight(0, z) < 90) return z; return 2900; })();
export const SPAWN = { x: 0, y: 180, z: spawnZ, heading: 0, speed: 70 };

// ---------------------------------------------------------------------------
// Delivered by Midnight: missão de entregas (ver brain/decisoes/0005-delivered-by-midnight.md)
// ---------------------------------------------------------------------------

/** Estágios da progressão, do veículo mais comum ao mais maluco. */
export type Stage = 'car' | 'tuned' | 'heli' | 'a29';
export const STAGE_ORDER: Stage[] = ['car', 'tuned', 'heli', 'a29'];

/** Um ponto de entrega. Escrito pelo sistema de missão (mission.ts, Codex); HUD, marcadores e minimapa leem. */
export interface DeliveryPoint {
  id: string;
  stage: Stage;
  /** Nome curto e original do destinatário/lugar (aparece no HUD). */
  name: string;
  x: number;
  y: number;
  z: number;
  /** Raio (m) em que a entrega conta. */
  radius: number;
  /** true = entrega por lançamento aéreo (A-29): solta a caixa com Espaço sobre o alvo. */
  airDrop?: boolean;
  /** true = a última entrega do estágio, feita onde está o próximo veículo. */
  leadsToNext?: boolean;
  delivered: boolean;
}

export interface MissionState {
  status: 'intro' | 'playing' | 'won' | 'lost';
  /** Relógio do jogo em minutos: 0 = 00:00 (início); 1440 = 24:00 (prazo final). */
  clockMinutes: number;
  /** Estágio mais avançado liberado. */
  stage: Stage;
  deliveries: DeliveryPoint[];
  /** Encomendas a bordo: o estágio do veículo atual quando o jogador entrou nele (null a pé ou já entregues). */
  carrying: Stage | null;
  /** Entrega destacada agora (a mais próxima pendente do que está a bordo). */
  nextDeliveryId: string | null;
  /** Mensagem curta para o HUD (ex.: "Entregue! +150") e quanto tempo ainda mostrar (s). */
  message: string | null;
  messageTimer: number;
  delivered: number;
  total: number;
  score: number;
}

export function createMissionState(): MissionState {
  return {
    status: 'intro',
    clockMinutes: 0,
    stage: 'car',
    deliveries: [],
    carrying: null,
    nextDeliveryId: null,
    message: null,
    messageTimer: 0,
    delivered: 0,
    total: 0,
    score: 0,
  };
}

/** Contexto entregue a cada módulo na inicialização. */
export interface FlightContext {
  app: AppBase;
  world: World;
  plane: AirplaneModel;
  /** Câmera principal (um único Entity com componente camera). */
  camera: Entity;
  state: FlightState;
  /** Estado da missão (criado pelo game.ts; escrito só pelo mission.ts). */
  mission?: MissionState;
}

/** Interface comum dos módulos: criados uma vez, atualizados todo quadro pelo main.ts. */
export interface FlightModule {
  update(dt: number): void;
  destroy?(): void;
}

// Assinaturas esperadas (cada dono implementa no seu arquivo):
//   flight.ts  → export function createFlightController(ctx: FlightContext): FlightModule
//   cameras.ts → export function createCameraRig(ctx: FlightContext): FlightModule
//   cockpit.ts → export function createCockpit(ctx: FlightContext): FlightModule   (painel HTML/canvas, visível só em 'cockpit')
//   hud.ts     → export function createHud(ctx: FlightContext): FlightModule       (HUD HTML, todas as câmeras)
// Ordem de update no main.ts: flight → cameras → cockpit → hud.
