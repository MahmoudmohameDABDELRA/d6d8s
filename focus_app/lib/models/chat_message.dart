enum ChatSender { app, user }

class ChatMessage {
  final ChatSender sender;
  final String text;
  final DateTime time;

  ChatMessage({required this.sender, required this.text, DateTime? time})
      : time = time ?? DateTime.now();
}
