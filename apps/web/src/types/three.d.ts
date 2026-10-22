/**
 * `three` nu publică propriile declarații de tipuri, iar `@types/three` nu e
 * dependență a workspace-ului. Landing-ul folosește o felie mică și stabilă a
 * API-ului (Scene, PerspectiveCamera, WebGLRenderer, Points), deci declarăm
 * modulul shorthand — importurile devin `any`, verificate la runtime.
 */
declare module 'three';
