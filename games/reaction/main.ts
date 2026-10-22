import { createGame } from './game'
import '../../src/style/base.css'
import './style.css'

const mount = document.getElementById('app')
if (mount) createGame(mount)
