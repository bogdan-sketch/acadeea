package com.horae.app.di

import com.horae.app.BuildConfig
import com.horae.app.data.remote.api.AuthApi
import com.horae.app.data.remote.api.AnalyticsApi
import com.horae.app.data.remote.api.ChangelogApi
import com.horae.app.data.remote.api.IntegrationApi
import com.horae.app.data.remote.api.NotificationApi
import com.horae.app.data.remote.api.DashboardApi
import com.horae.app.data.remote.api.LocationApi
import com.horae.app.data.remote.api.EquipmentApi
import com.horae.app.data.remote.api.OrderApi
import com.horae.app.data.remote.api.OrganizationApi
import com.horae.app.data.remote.api.RecipeApi
import com.horae.app.data.remote.api.RoleApi
import com.horae.app.data.remote.api.DataResetApi
import com.horae.app.data.remote.api.SalesDeductionApi
import com.horae.app.data.remote.api.StockApi
import com.horae.app.data.remote.api.TaskApi
import com.horae.app.data.remote.api.TutorialApi
import com.horae.app.data.remote.api.UserApi
import com.horae.app.data.remote.dto.SerializeNullsAdapterFactory
import com.horae.app.data.remote.interceptor.AuthInterceptor
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder()
        .add(SerializeNullsAdapterFactory)
        .addLast(KotlinJsonAdapterFactory())
        .build()

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: AuthInterceptor): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)

        if (BuildConfig.DEBUG) {
            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            builder.addInterceptor(loggingInterceptor)
        }

        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL + "/")
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideTaskApi(retrofit: Retrofit): TaskApi =
        retrofit.create(TaskApi::class.java)

    @Provides
    @Singleton
    fun provideStockApi(retrofit: Retrofit): StockApi =
        retrofit.create(StockApi::class.java)

    @Provides
    @Singleton
    fun provideUserApi(retrofit: Retrofit): UserApi =
        retrofit.create(UserApi::class.java)

    @Provides
    @Singleton
    fun provideRecipeApi(retrofit: Retrofit): RecipeApi =
        retrofit.create(RecipeApi::class.java)

    @Provides
    @Singleton
    fun provideOrderApi(retrofit: Retrofit): OrderApi =
        retrofit.create(OrderApi::class.java)

    @Provides
    @Singleton
    fun provideEquipmentApi(retrofit: Retrofit): EquipmentApi =
        retrofit.create(EquipmentApi::class.java)

    @Provides
    @Singleton
    fun provideLocationApi(retrofit: Retrofit): LocationApi =
        retrofit.create(LocationApi::class.java)

    @Provides
    @Singleton
    fun provideDashboardApi(retrofit: Retrofit): DashboardApi =
        retrofit.create(DashboardApi::class.java)

    @Provides
    @Singleton
    fun provideChangelogApi(retrofit: Retrofit): ChangelogApi =
        retrofit.create(ChangelogApi::class.java)

    @Provides
    @Singleton
    fun provideNotificationApi(retrofit: Retrofit): NotificationApi =
        retrofit.create(NotificationApi::class.java)

    @Provides
    @Singleton
    fun provideAnalyticsApi(retrofit: Retrofit): AnalyticsApi =
        retrofit.create(AnalyticsApi::class.java)

    @Provides
    @Singleton
    fun provideIntegrationApi(retrofit: Retrofit): IntegrationApi =
        retrofit.create(IntegrationApi::class.java)

    @Provides
    @Singleton
    fun provideOrganizationApi(retrofit: Retrofit): OrganizationApi =
        retrofit.create(OrganizationApi::class.java)

    @Provides
    @Singleton
    fun provideRoleApi(retrofit: Retrofit): RoleApi =
        retrofit.create(RoleApi::class.java)

    @Provides
    @Singleton
    fun provideTutorialApi(retrofit: Retrofit): TutorialApi =
        retrofit.create(TutorialApi::class.java)

    @Provides
    @Singleton
    fun provideSalesDeductionApi(retrofit: Retrofit): SalesDeductionApi =
        retrofit.create(SalesDeductionApi::class.java)

    @Provides
    @Singleton
    fun provideDataResetApi(retrofit: Retrofit): DataResetApi =
        retrofit.create(DataResetApi::class.java)
}
