package com.bnp.paribas.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Exactly the endpoints in the SmartHire contract — nothing invented.
 * The Authorization header is passed per call so the platform token and the exam token can
 * never be mixed up.
 */
interface SmartHireApi {

    // ---- Auth ----
    @GET("health")
    suspend fun health(): Response<ResponseBody>

    @GET("auth/login")
    suspend fun login(
        @Query("email") email: String,
        @Query("password") password: String
    ): Response<ResponseBody>

    @GET("auth/signup/candidate")
    suspend fun signup(
        @Query("email") email: String,
        @Query("password") password: String,
        @Query("name") name: String
    ): Response<ResponseBody>

    // ---- Public ----
    @GET("public/jobs")
    suspend fun jobs(): Response<ResponseBody>

    @GET("public/search")
    suspend fun search(
        @Query("q") q: String,
        @Query("limit") limit: Int
    ): Response<ResponseBody>

    @GET("public/jobs/{jd_id}")
    suspend fun job(@Path("jd_id") jdId: String): Response<ResponseBody>

    @GET("public/orgs/{org_id}")
    suspend fun org(@Path("org_id") orgId: String): Response<ResponseBody>

    // ---- Candidate (platform session) ----
    @GET("candidate/dashboard")
    suspend fun dashboard(@Header("Authorization") auth: String): Response<ResponseBody>

    @GET("candidate/me")
    suspend fun me(@Header("Authorization") auth: String): Response<ResponseBody>

    @GET("candidate/me/update")
    suspend fun updateName(
        @Header("Authorization") auth: String,
        @Query("name") name: String
    ): Response<ResponseBody>

    @Multipart
    @POST("candidate/me/resume")
    suspend fun uploadResume(
        @Header("Authorization") auth: String,
        @Part file: MultipartBody.Part
    ): Response<ResponseBody>

    @GET("candidate/me/applications")
    suspend fun applications(@Header("Authorization") auth: String): Response<ResponseBody>

    @GET("candidate/apply/{jd_id}")
    suspend fun apply(
        @Header("Authorization") auth: String,
        @Path("jd_id") jdId: String
    ): Response<ResponseBody>

    @GET("candidate/me/applications/{app_id}")
    suspend fun application(
        @Header("Authorization") auth: String,
        @Path("app_id") appId: String
    ): Response<ResponseBody>



    // ---- Exam (separate exam session token) ----
    @GET("exam/login")
    suspend fun examLogin(
        @Query("exam_id") examId: String,
        @Query("email") email: String,
        @Query("password") password: String
    ): Response<ResponseBody>

    @GET("exam/{exam_id}")
    suspend fun exam(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String
    ): Response<ResponseBody>

    @GET("exam/{exam_id}/start")
    suspend fun examStart(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String
    ): Response<ResponseBody>

    @GET("exam/{exam_id}/submit")
    suspend fun examSubmit(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String,
        @Query("answers") answers: String
    ): Response<ResponseBody>

    @POST("exam/{exam_id}/submit")
    suspend fun examSubmitPost(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String,
        @Body body: RequestBody
    ): Response<ResponseBody>

    @GET("exam/{exam_id}/result")
    suspend fun examResult(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String
    ): Response<ResponseBody>

    @GET("exam/{exam_id}/proctor/event")
    suspend fun proctorEvent(
        @Header("Authorization") auth: String,
        @Path("exam_id") examId: String,
        @Query("event_type") eventType: String,
        @Query("timestamp") timestamp: String?,
        @Query("duration") duration: Long?,
        @Query("details") details: String?
    ): Response<ResponseBody>
}
