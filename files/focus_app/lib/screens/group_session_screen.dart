import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/friend_tile.dart';
import '../widgets/pill_buttons.dart';

class GroupSessionScreen extends StatefulWidget {
  const GroupSessionScreen({super.key});

  @override
  State<GroupSessionScreen> createState() => _GroupSessionScreenState();
}

class _GroupSessionScreenState extends State<GroupSessionScreen> {
  late List<FriendData> friends;

  @override
  void initState() {
    super.initState();
    friends = const [
      FriendData(
        name: 'محمود',
        online: true,
        selected: true,
        ringColor: AppColors.onlineDot,
      ),
      FriendData(
        name: 'سارة',
        online: true,
        selected: true,
        ringColor: AppColors.gold,
      ),
      FriendData(
        name: 'كريم',
        online: false,
        selected: false,
        ringColor: AppColors.offlineDot,
      ),
      FriendData(
        name: 'ليلى',
        online: true,
        selected: false,
        ringColor: Color(0xFFE07AA0),
      ),
    ];
  }

  int get selectedCount => friends.where((f) => f.selected).length;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 18),
                Center(
                  child: Text('جلسة جماعية',
                      style: AppText.heading.copyWith(fontSize: 26)),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    'اختر أصدقاءك المتصلين — نفس إعداداتك: 30/5/3',
                    textAlign: TextAlign.center,
                    style: AppText.subheading,
                  ),
                ),
                const SizedBox(height: 24),

                Expanded(
                  child: ListView.builder(
                    itemCount: friends.length,
                    itemBuilder: (context, index) {
                      final f = friends[index];
                      return FriendTile(
                        friend: f,
                        onChanged: (v) {
                          setState(() {
                            friends[index] = FriendData(
                              name: f.name,
                              online: f.online,
                              selected: v,
                              ringColor: f.ringColor,
                              avatarIcon: f.avatarIcon,
                            );
                          });
                        },
                      );
                    },
                  ),
                ),

                PrimaryPillButton(
                  label: 'إرسال الدعوات',
                  trailingIcon: Icons.mail_outline,
                  onTap: () {},
                  badge: selectedCount > 0
                      ? Container(
                          width: 22,
                          height: 22,
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                            color: AppColors.gold,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '$selectedCount',
                            style: AppText.button.copyWith(fontSize: 12),
                          ),
                        )
                      : null,
                ),
                const SizedBox(height: 16),

                const AppBottomNavBar(
                  iconsOrder: [
                    Icons.image_outlined,
                    Icons.check_circle_outline,
                    Icons.add,
                    Icons.chat_bubble_outline,
                    Icons.person_outline,
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
