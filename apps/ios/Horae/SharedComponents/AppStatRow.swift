import SwiftUI

/// Randul de statistici-filtru — acelasi aliniament ca quick actions:
/// cand incap toate pe latimea paginii (putine pe iPhone, aproape mereu pe
/// iPad), centrate; cand nu, rand cu scroll orizontal, full-bleed cu gutter
/// 20pt. `ViewThatFits` alege singur, deci acelasi cod merge pe orice latime.
struct AppStatRow<Content: View>: View {
    let count: Int
    @ViewBuilder let content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: AppTheme.Spacing.sm) { content }
                .padding(.horizontal, 20)
                .padding(.vertical, AppTheme.Spacing.sm)
                .frame(maxWidth: .infinity)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AppTheme.Spacing.sm) { content }
                    .padding(.horizontal, 20)
                    .padding(.vertical, AppTheme.Spacing.sm)
            }
        }
    }
}
