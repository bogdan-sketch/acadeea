package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.JsonQualifier
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import java.lang.reflect.Type

/**
 * Marks a nullable DTO field whose `null` value must be written to JSON (Moshi drops nulls by
 * default). Needed for PATCH semantics where an explicit `null` means "reset to default" while an
 * omitted key means "leave unchanged" (e.g. Organization secondary/tertiary branding colors).
 *
 * Requires [SerializeNullsAdapterFactory] to be registered on the Moshi instance (NetworkModule).
 */
@Retention(AnnotationRetention.RUNTIME)
@JsonQualifier
annotation class SerializeNulls

object SerializeNullsAdapterFactory : JsonAdapter.Factory {
    override fun create(
        type: Type,
        annotations: MutableSet<out Annotation>,
        moshi: Moshi,
    ): JsonAdapter<*>? {
        val nextAnnotations = Types.nextAnnotations(annotations, SerializeNulls::class.java)
            ?: return null
        return moshi.nextAdapter<Any>(this, type, nextAnnotations).serializeNulls()
    }
}
