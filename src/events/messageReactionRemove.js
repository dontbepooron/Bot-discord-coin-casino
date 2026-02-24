export default {
  name: 'messageReactionRemove',
  async execute(client, reaction, user) {
    if (!client.handleGiveawayReactionRemove) return
    await client.handleGiveawayReactionRemove(reaction, user).catch(() => null)
  },
}
