/* The generated entry's first import. The runtime loads first — that
 * is when mount.js takes the tty's writer — and then the tty and the
 * console are sealed. See harden.js for what and why. */

import "yeetkit";
import { harden } from "./harden.js";

harden();
