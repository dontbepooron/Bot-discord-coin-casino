export default {
  name: 'messageReactionAdd',
  async execute(client, reaction, user) {
    if (!client.handleGiveawayReactionAdd) return
    await client.handleGiveawayReactionAdd(reaction, user).catch(() => null)
  },
}
