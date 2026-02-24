import { handleVoiceStateGain } from '../utils/gainSystem.js'

export default {
  name: 'voiceStateUpdate',
  async execute(client, oldState, newState) {
    handleVoiceStateGain(client, oldState, newState)
  },
}
