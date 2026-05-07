import type { GlobalSessionEvent, SessionUiEvent } from "../../shared/apiTypes.js";
import type { WebSocket } from "ws";

export class SessionEventHub {
  private readonly socketsBySession = new Map<string, Set<WebSocket>>();
  private readonly globalSockets = new Set<WebSocket>();

  add(sessionId: string, socket: WebSocket): void {
    let sockets = this.socketsBySession.get(sessionId);
    if (!sockets) {
      sockets = new Set();
      this.socketsBySession.set(sessionId, sockets);
    }
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  }

  addGlobal(socket: WebSocket): void {
    this.globalSockets.add(socket);
    socket.on("close", () => this.globalSockets.delete(socket));
  }

  publish(sessionId: string, event: SessionUiEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.socketsBySession.get(sessionId) ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  publishGlobal(event: GlobalSessionEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.globalSockets) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }
}
