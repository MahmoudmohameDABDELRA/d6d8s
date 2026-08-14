import 'package:flutter_test/flutter_test.dart';
import 'package:bal_app/main.dart';

void main() {
  testWidgets('التطبيق يقلع', (tester) async {
    await tester.pumpWidget(const BalApp());
    await tester.pump();
    expect(find.byType(BalApp), findsOneWidget);
  });
}
