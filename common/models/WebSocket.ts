import {ServerHistory} from "./serverData";

export interface WebsocketMessage {
    type: 'update';
    data: any;
    timestamp: number;
}

export interface WebsocketUpdate {
    type: 'update';
    data: ServerHistory[];
}